use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_interface};
use earn::cpi::accounts::PropagateIndex;

use spl_token_2022::onchain;

use crate::{
    config::*,
    error::NTTError,
    instructions::BridgeEvent,
    ntt_messages::Mode,
    queue::inbox::{InboxItem, ReleaseStatus},
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
        address = if inbox_item.transfer.amount > 0 {
            get_associated_token_address_with_program_id(
                &inbox_item.transfer.recipient,
                &mint.key(),
                &token_program.key(),
            )
        } else {
            recipient.key()
        }
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
    common: ReleaseInbound<'info>,

    #[account(
        constraint =
         multisig.m == 1 && multisig.signers.contains(&common.token_authority.key())
            @ NTTError::InvalidMultisig,
    )]
    pub multisig: InterfaceAccount<'info, SplMultisig>,
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

    if inbox_item.transfer.amount > 0 {
        // Mint then transfer to ensure transfer hook is called
        invoke_signed(
            &spl_token_2022::instruction::mint_to(
                &ctx.accounts.common.token_program.key(),
                &ctx.accounts.common.mint.key(),
                &ctx.accounts.common.custody.key(),
                &ctx.accounts.multisig.key(),
                &[&ctx.accounts.common.token_authority.key()],
                inbox_item.transfer.amount,
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
            inbox_item.transfer.amount,
            ctx.accounts.common.mint.decimals,
            token_authority_sig,
        )?;

        ctx.accounts.common.mint.reload()?;

        emit!(BridgeEvent {
            amount: inbox_item.transfer.amount as i64,
            token_supply: ctx.accounts.common.mint.supply,
            to: inbox_item.transfer.recipient.to_bytes(),
            from: inbox_item.source.from,
            wormhole_chain_id: inbox_item.source.chain.id,
        });
    }

    // Send update to the earn program
    {
        let expected_accounts = &ctx
            .accounts
            .common
            .config
            .release_inbound_remaining_accounts;

        // Remaining accounts required for CPI to earn program
        if ctx.remaining_accounts.len() < expected_accounts.len() {
            return err!(NTTError::InvalidRemainingAccount);
        }

        for (i, account) in expected_accounts.iter().enumerate() {
            if account.pubkey != ctx.remaining_accounts[i].key() {
                return err!(NTTError::InvalidRemainingAccount);
            }
        }

        let ctx = CpiContext::new_with_signer(
            ctx.remaining_accounts[0].clone(),
            PropagateIndex {
                signer: ctx.accounts.common.token_authority.to_account_info(),
                global_account: ctx.remaining_accounts[1].clone(),
                mint: ctx.accounts.common.mint.to_account_info(),
            },
            token_authority_sig,
        );

        let earner_root = inbox_item.earners_root_update.unwrap_or_default();
        earn::cpi::propagate_index(ctx, inbox_item.index_update, earner_root)?;

        msg!(
            "Index update: {} | root update: {}",
            inbox_item.index_update,
            inbox_item.earners_root_update.is_some()
        );
    }

    Ok(())
}
