use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use earn::state::{EarnGlobal, GLOBAL_SEED};
use ext_swap::accounts::SwapGlobal;
use ext_swap::program::ExtSwap;

use crate::instructions::{ext_swap, release_inbound_mint_multisig};
use crate::instructions::{ReleaseInboundArgs, ReleaseInboundMintMultisig};
use crate::ReleaseInboundMintMultisigBumps;
use crate::__client_accounts_release_inbound_mint_multisig;
use crate::__cpi_client_accounts_release_inbound_mint_multisig;

#[derive(Accounts)]
pub struct ReleaseInboundMintExtensionMultisig<'info> {
    pub common: ReleaseInboundMintMultisig<'info>,

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
        seeds = [GLOBAL_SEED],
        seeds::program = earn::ID,
        bump = m_global.bump,
    )]
    pub m_global: Box<Account<'info, EarnGlobal>>,

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
        associated_token::mint = common.common.mint,
        associated_token::authority = ext_m_vault_auth,
        associated_token::token_program = common.common.token_program,
    )]
    pub ext_m_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
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

pub fn release_inbound_mint_extension_multisig<'info>(
    ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintExtensionMultisig<'info>>,
) -> Result<()> {
    let m_pre_balance = ctx.accounts.common.common.recipient.amount;
    let token_auth_bump = ctx.bumps.common.common.token_authority;

    // Release bridged $M
    release_inbound_mint_multisig(
        Context::new(
            ctx.program_id,
            &mut ctx.accounts.common,
            ctx.remaining_accounts,
            ReleaseInboundMintMultisigBumps {
                common: ctx.bumps.common.common,
            },
        ),
        ReleaseInboundArgs {
            // always revert on delay or wrap will fail
            revert_on_delay: true,
        },
    )?;

    ctx.accounts.common.common.recipient.reload()?;

    let wrap_amount = ctx
        .accounts
        .common
        .common
        .recipient
        .amount
        .saturating_sub(m_pre_balance);

    // Wrap $M to extension tokens
    ext_swap::cpi::wrap(
        CpiContext::new_with_signer(
            ctx.accounts.swap_program.to_account_info(),
            ext_swap::cpi::accounts::Wrap {
                signer: ctx.accounts.common.common.payer.to_account_info(),
                wrap_authority: Some(ctx.accounts.common.common.token_authority.to_account_info()),
                swap_global: ctx.accounts.swap_global.to_account_info(),
                to_global: ctx.accounts.ext_global.to_account_info(),
                to_mint: ctx.accounts.ext_mint.to_account_info(),
                m_mint: ctx.accounts.common.common.mint.to_account_info(),
                m_token_account: ctx.accounts.common.common.recipient.to_account_info(),
                to_token_account: ctx.accounts.ext_token_account.to_account_info(),
                to_m_vault_auth: ctx.accounts.ext_m_vault_auth.to_account_info(),
                to_mint_authority: ctx.accounts.ext_mint_authority.to_account_info(),
                to_m_vault: ctx.accounts.ext_m_vault.to_account_info(),
                to_token_program: ctx.accounts.ext_token_program.to_account_info(),
                m_token_program: ctx.accounts.common.common.token_program.to_account_info(),
                to_ext_program: ctx.accounts.ext_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            &[&[crate::TOKEN_AUTHORITY_SEED, &[token_auth_bump]]],
        ),
        wrap_amount,
    )?;

    Ok(())
}
