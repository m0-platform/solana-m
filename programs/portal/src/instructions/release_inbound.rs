use anchor_lang::prelude::*;
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_interface};
use earn::{
    cpi::accounts::PropagateIndex,
    program::Earn,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::conversion::amount_to_principal_down,
};
use spl_token_2022::onchain;

use crate::{
    config::*,
    error::NTTError,
    instructions::BridgeEvent,
    ntt_messages::Mode,
    queue::inbox::{InboxItem, ReleaseStatus},
};

#[derive(Accounts)]
pub struct ReleaseInboundMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = config.mode == Mode::Burning @ NTTError::InvalidMode,
    )]
    pub config: NotPausedConfig<'info>,

    #[account(mut)]
    pub inbox_item: Account<'info, InboxItem>,

    #[account(mut)]
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

    pub earn_program: Program<'info, Earn>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = earn::ID,
        bump = m_global.bump,
    )]
    pub m_global: Box<Account<'info, EarnGlobal>>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct ReleaseInboundArgs {
    pub revert_when_not_ready: bool,
}

pub fn release_inbound_mint<'info>(
    ctx: Context<'_, '_, '_, 'info, ReleaseInboundMint<'info>>,
    args: ReleaseInboundArgs,
) -> Result<()> {
    let inbox_item = &mut ctx.accounts.inbox_item;

    // Validate token account depending on call context
    validate_recipient_token_account(
        &ctx.accounts.recipient.key(),
        &inbox_item,
        &ctx.accounts.token_authority.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
    )?;

    if !inbox_item.try_release()? {
        msg!("Item cannot be released: {:?}", inbox_item.release_status);
        if args.revert_when_not_ready {
            return Err(NTTError::CantReleaseYet.into());
        }
        return Ok(());
    }

    assert!(inbox_item.release_status == ReleaseStatus::Released);

    let token_authority_sig: &[&[&[u8]]] =
        &[&[crate::TOKEN_AUTHORITY_SEED, &[ctx.bumps.token_authority]]];

    let propogate_ctx = CpiContext::new_with_signer(
        ctx.accounts.earn_program.to_account_info(),
        PropagateIndex {
            signer: ctx.accounts.token_authority.to_account_info(),
            global_account: ctx.accounts.m_global.to_account_info(),
            m_mint: ctx.accounts.mint.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
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
        ctx.accounts.mint.reload()?;

        // Get the multiplier from the mint
        // We load it rather than using the index provided in the inbox item
        // since it is possible that the inbox index is not the latest
        let scaled_ui_config = earn::utils::conversion::get_scaled_ui_config(&ctx.accounts.mint)?;

        // Get the principal amount of $M tokens to transfer using the multiplier
        let principal = amount_to_principal_down(
            inbox_item.transfer.amount,
            scaled_ui_config.new_multiplier.into(),
        )?;

        // Mint then transfer to ensure transfer hook is called
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.custody.to_account_info(),
                    authority: ctx.accounts.token_authority.to_account_info(),
                },
                token_authority_sig,
            ),
            principal,
        )?;

        onchain::invoke_transfer_checked(
            &ctx.accounts.token_program.key(),
            ctx.accounts.custody.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.token_authority.to_account_info(),
            ctx.remaining_accounts,
            principal,
            ctx.accounts.mint.decimals,
            token_authority_sig,
        )?;

        ctx.accounts.mint.reload()?;

        emit!(BridgeEvent {
            amount: principal as i64,
            token_supply: ctx.accounts.mint.supply,
            to: inbox_item.transfer.recipient.to_bytes(),
            from: inbox_item.source.from,
            wormhole_chain_id: inbox_item.source.chain.id,
        });
    }

    Ok(())
}

fn validate_recipient_token_account(
    recipient: &Pubkey,
    inbox_item: &InboxItem,
    token_authority: &Pubkey,
    m_mint: &Pubkey,
    token_program: &Pubkey,
) -> Result<()> {
    let expected = get_inbox_recipient_token_account(
        &inbox_item.transfer.recipient,
        &inbox_item.destination_mint,
        inbox_item.transfer.amount,
        token_authority,
        m_mint,
        token_program,
    );

    if expected.is_some() && !expected.unwrap().eq(recipient) {
        return err!(NTTError::InvalidRecipientAddress);
    }

    Ok(())
}

pub fn get_inbox_recipient_token_account(
    recipient: &Pubkey,
    destination_mint: &Pubkey,
    amount: u64,
    token_authority: &Pubkey,
    m_mint: &Pubkey,
    token_program: &Pubkey,
) -> Option<Pubkey> {
    // Only bridging data
    if amount == 0 {
        return None;
    }

    // Bridging to extension, require intermediate portal token account
    if !destination_mint.eq(m_mint) {
        return Some(get_associated_token_address_with_program_id(
            token_authority,
            m_mint,
            token_program,
        ));
    }

    // Bridging $M, require user token account
    Some(get_associated_token_address_with_program_id(
        &recipient,
        m_mint,
        token_program,
    ))
}
