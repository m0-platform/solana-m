use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_interface};
use earn::{
    cpi::accounts::PropagateIndex, program::Earn, state::EarnGlobal,
    utils::conversion::amount_to_principal_down,
};
use spl_token_2022::onchain;

use crate::{
    config::*,
    error::NTTError,
    instructions::BridgeEvent,
    ntt_messages::Mode,
    queue::inbox::{InboxItem, ReleaseStatus, TokenTransfer},
    spl_multisig::SplMultisig,
};

#[derive(Accounts)]
pub struct ReleaseInbound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub config: NotPausedConfig<'info>,

    #[account(mut)]
    pub inbox_item: Account<'info, InboxItem>,

    #[account(
        mut,
        address = get_recipient_token_account(
            &inbox_item.transfer,
            &recipient.owner,
            &mint.key(),
            &token_program.key,
            &token_authority.key()
        ).unwrap_or(recipient.key()),
    )]
    pub recipient: InterfaceAccount<'info, token_interface::TokenAccount>,

    #[account(
        seeds = [crate::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    /// CHECK The seeds constraint ensures that this is the correct address
    pub token_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.mint,
    )]
    /// CHECK: the mint address matches the config
    pub mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, token_interface::TokenInterface>,

    /// CHECK: the token program checks if this indeed the right authority for the mint
    #[account(
        mut,
        address = config.custody
    )]
    pub custody: InterfaceAccount<'info, token_interface::TokenAccount>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct ReleaseInboundArgs {
    pub revert_on_delay: bool,
}

#[derive(Accounts)]
pub struct ReleaseInboundMintMultisig<'info> {
    #[account(
        constraint = common.config.mode == Mode::Burning @ NTTError::InvalidMode,
    )]
    pub common: ReleaseInbound<'info>,

    #[account(
        constraint =
         multisig.m == 1 && multisig.signers.contains(&common.token_authority.key())
            @ NTTError::InvalidMultisig,
    )]
    pub multisig: InterfaceAccount<'info, SplMultisig>,

    pub earn_program: Program<'info, Earn>,

    pub earn_global: Box<Account<'info, EarnGlobal>>,
}

pub fn release_inbound_mint_multisig<'info>(
    ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintMultisig<'info>>,
    args: ReleaseInboundArgs,
) -> Result<()> {
    let inbox_item = &mut ctx.accounts.common.inbox_item;

    if !inbox_item.try_release()? {
        msg!("Item cannot be released: {:?}", inbox_item.release_status);
        if args.revert_on_delay {
            return Err(NTTError::CantReleaseYet.into());
        }
        return Ok(());
    }

    assert!(inbox_item.release_status == ReleaseStatus::Released);

    let token_authority_sig: &[&[&[u8]]] = &[&[
        crate::TOKEN_AUTHORITY_SEED,
        &[ctx.bumps.common.token_authority],
    ]];

    let propogate_ctx = CpiContext::new_with_signer(
        ctx.accounts.earn_program.to_account_info(),
        PropagateIndex {
            signer: ctx.accounts.common.token_authority.to_account_info(),
            global_account: ctx.accounts.earn_global.to_account_info(),
            m_mint: ctx.accounts.common.mint.to_account_info(),
            token_program: ctx.accounts.common.token_program.to_account_info(),
        },
        token_authority_sig,
    );

    // Propagate the index update before minting tokens
    let earner_root = inbox_item.earners_root_update.unwrap_or_default();
    earn::cpi::propagate_index(propogate_ctx, inbox_item.index_update, earner_root)?;

    msg!(
        "Index update: {} | root update: {}",
        inbox_item.index_update,
        inbox_item.earners_root_update.is_some()
    );

    // Mint and transfer tokens if the amount is greater than zero
    if inbox_item.transfer.amount > 0 {
        // Reload the mint to ensure the latest multiplier is used
        ctx.accounts.common.mint.reload()?;

        // Get the multiplier from the mint
        // We load it rather than using the index provided in the inbox item
        // since it is possible that the inbox index is not the latest
        let scaled_ui_config =
            earn::utils::conversion::get_scaled_ui_config(&ctx.accounts.common.mint)?;

        // Get the principal amount of $M tokens to transfer using the multiplier
        let principal = amount_to_principal_down(
            inbox_item.transfer.amount,
            scaled_ui_config.new_multiplier.into(),
        )?;

        // Mint then transfer to ensure transfer hook is called
        invoke_signed(
            &spl_token_2022::instruction::mint_to(
                &ctx.accounts.common.token_program.key(),
                &ctx.accounts.common.mint.key(),
                &ctx.accounts.common.custody.key(),
                &ctx.accounts.multisig.key(),
                &[&ctx.accounts.common.token_authority.key()],
                principal,
            )?,
            &[
                ctx.accounts.common.custody.to_account_info(),
                ctx.accounts.common.mint.to_account_info(),
                ctx.accounts.common.token_authority.to_account_info(),
                ctx.accounts.multisig.to_account_info(),
            ],
            token_authority_sig,
        )?;

        onchain::invoke_transfer_checked(
            &ctx.accounts.common.token_program.key(),
            ctx.accounts.common.custody.to_account_info(),
            ctx.accounts.common.mint.to_account_info(),
            ctx.accounts.common.recipient.to_account_info(),
            ctx.accounts.common.token_authority.to_account_info(),
            ctx.remaining_accounts,
            principal,
            ctx.accounts.common.mint.decimals,
            token_authority_sig,
        )?;

        ctx.accounts.common.mint.reload()?;

        emit!(BridgeEvent {
            amount: principal as i64,
            token_supply: ctx.accounts.common.mint.supply,
            to: inbox_item.transfer.recipient.to_bytes(),
            from: inbox_item.source.from,
            wormhole_chain_id: inbox_item.source.chain.id,
        });
    }

    Ok(())
}

fn get_recipient_token_account(
    transfer: &TokenTransfer,
    account_owner: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    token_authority: &Pubkey,
) -> Option<Pubkey> {
    // Only bridging data
    if transfer.amount == 0 {
        return None;
    }

    // Bridging to extension, require intermediate portal token account
    if account_owner.eq(token_authority) {
        return Some(get_associated_token_address_with_program_id(
            token_authority,
            mint,
            token_program,
        ));
    }

    // Bridging $M, require user token account
    Some(get_associated_token_address_with_program_id(
        &transfer.recipient,
        mint,
        token_program,
    ))
}
