use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::{freeze_token_account, thaw_token_account},
};

declare_program!(ext_swap);
use ext_swap::{accounts::SwapGlobal, program::ExtSwap};

declare_program!(wm_ext);
use wm_ext::{accounts::ExtGlobal, program::ExtEarn};

#[derive(Accounts)]
pub struct ManuallyFreezeAccount<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one: admin @ EarnError::NotAuthorized,
        has_one: m_mint @ EarnError::InvalidMint,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = m_mint,
        token::token_program = token_program
    )]
    pub m_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,

    pub ext_swap_program: Option<Program<'info, ExtSwap>>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap_program.as_ref().unwrap().key(),
        bump = ext_swap_global.bump,
    )]
    pub ext_swap_global: Option<Account<'info, SwapGlobal>>,

    #[account(mut, address = global_account.wm_mint)]
    pub wm_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds = [ESCROW_SEED_PREFIX, user_token_account.key().as_ref()],
        bump,
        token::mint = wm_mint,
        token::authority = global_account,
        token::token_program = token_program,
    )]
    pub wm_escrow: Option<InterfaceAccount<'info, TokenAccount>>,

    pub wm_ext_program: Option<Program<'info, ExtEarn>>,

    /// CHECK: This is validated in the CPI call to ext_swap
    pub wm_mint_authority: Option<UncheckedAccount<'info>>,

    /// CHECK: This is validated in the CPI call to ext_swap
    pub wm_vault_authority: Option<UncheckedAccount<'info>>,

    #[account(mut)]
    pub wm_vault: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub wm_ext_global: Option<Account<'info, ExtGlobal>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub system_program: Option<Program<'info, System>>,
}

impl ManuallyFreezeAccount<'_> {
    // fn validate(&self, proofs)
}

#[derive(Accounts)]
pub struct ManuallyThawAccount {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one: admin @ EarnError::NotAuthorized,
        has_one: m_mint @ EarnError::InvalidMint,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = m_mint,
        token::token_program = token_program
    )]
    pub m_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl ManuallyThawAccount {
    fn validate(&self) -> Result<()> {
        // TODO: should we check that the account is not on the earner list?
        // I don't know it if mattershj

        Ok(())
    }
}
