use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use earn::state::GLOBAL_SEED;
use ext_swap::accounts::SwapGlobal;
use ext_swap::program::ExtSwap;

use crate::error::NTTError;
use crate::instructions::{ext_swap, release_inbound_mint_common};
use crate::instructions::{ReleaseInboundArgs, ReleaseInboundMint};
use crate::ReleaseInboundMintBumps;
use crate::__client_accounts_release_inbound_mint;
use crate::__cpi_client_accounts_release_inbound_mint;

#[derive(Accounts)]
pub struct ReleaseInboundMintExtension<'info> {
    pub common: ReleaseInboundMint<'info>,

    #[account(mut)]
    pub ext_mint: Box<InterfaceAccount<'info, Mint>>,

    /*
     * Globals
     */
    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap::ID,
        bump = swap_global.bump,
    )]
    pub swap_global: Box<Account<'info, SwapGlobal>>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: wrap CPI will validate the account
    pub ext_global: AccountInfo<'info>,

    /*
     * Authorities
     */
    #[account(
        seeds = [b"m_vault"],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_m_vault_auth: AccountInfo<'info>,

    #[account(
        seeds = [b"mint_authority"],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_mint_authority: AccountInfo<'info>,

    /*
     * Token Accounts
     */
    #[account(
        mut,
        associated_token::mint = common.mint,
        associated_token::authority = ext_m_vault_auth,
        associated_token::token_program = common.token_program,
    )]
    pub ext_m_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = ext_mint,
        associated_token::authority = common.inbox_item.transfer.recipient,
        associated_token::token_program = ext_token_program,
    )]
    pub ext_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /*
     * Programs
     */
    pub swap_program: Program<'info, ExtSwap>,

    /// CHECK: checked against whitelisted extensions
    pub ext_program: AccountInfo<'info>,

    pub ext_token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn release_inbound_mint_extension<'info>(
    ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintExtension<'info>>,
) -> Result<()> {
    let m_pre_balance = ctx.accounts.common.recipient.amount;
    let token_auth_bump = ctx.bumps.common.token_authority;

    // Release bridged $M
    release_inbound_mint_common(
        Context::new(
            ctx.program_id,
            &mut ctx.accounts.common,
            ctx.remaining_accounts,
            ReleaseInboundMintBumps {
                config: ctx.bumps.common.config,
                token_authority: ctx.bumps.common.token_authority,
            },
        ),
        ReleaseInboundArgs {
            // always revert on delay or wrap will fail
            revert_when_not_ready: true,
        },
        true,
    )?;

    ctx.accounts.common.recipient.reload()?;

    // Ensure target extensions is correct
    // (only validate if we know the extension exists)
    let target_mint = &ctx.accounts.common.inbox_item.destination_mint;
    if ctx
        .accounts
        .swap_global
        .whitelisted_extensions
        .iter()
        .find(|ext| ext.mint.eq(target_mint))
        .is_some()
    {
        if !ctx.accounts.ext_mint.key().eq(target_mint) {
            return err!(NTTError::InvalidMint);
        }
    }

    let wrap_amount = ctx
        .accounts
        .common
        .recipient
        .amount
        .saturating_sub(m_pre_balance);

    // Wrap $M to extension tokens
    ext_swap::cpi::wrap(
        CpiContext::new_with_signer(
            ctx.accounts.swap_program.to_account_info(),
            ext_swap::cpi::accounts::Wrap {
                signer: ctx.accounts.common.token_authority.to_account_info(),
                wrap_authority: Some(ctx.accounts.common.token_authority.to_account_info()),
                swap_global: ctx.accounts.swap_global.to_account_info(),
                to_global: ctx.accounts.ext_global.to_account_info(),
                to_mint: ctx.accounts.ext_mint.to_account_info(),
                m_mint: ctx.accounts.common.mint.to_account_info(),
                m_token_account: ctx.accounts.common.recipient.to_account_info(),
                to_token_account: ctx.accounts.ext_token_account.to_account_info(),
                to_m_vault_auth: ctx.accounts.ext_m_vault_auth.to_account_info(),
                to_mint_authority: ctx.accounts.ext_mint_authority.to_account_info(),
                to_m_vault: ctx.accounts.ext_m_vault.to_account_info(),
                to_token_program: ctx.accounts.ext_token_program.to_account_info(),
                m_token_program: ctx.accounts.common.token_program.to_account_info(),
                to_ext_program: ctx.accounts.ext_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            &[&[crate::TOKEN_AUTHORITY_SEED, &[token_auth_bump]]],
        ),
        wrap_amount,
    )?;

    Ok(())
}
