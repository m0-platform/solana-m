use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

use crate::{
    constants::PORTAL_PROGRAM,
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED, TOKEN_AUTHORITY_SEED},
    utils::token::thaw_token_account,
};

#[derive(Accounts)]
pub struct UpdatePortalAuthority<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ EarnError::NotAuthorized,
        has_one = m_mint @ EarnError::InvalidMint,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    /// CHECK: Authority that does not hold data
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        seeds::program = PORTAL_PROGRAM,
        bump,
    )]
    pub new_portal_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = m_mint,
        associated_token::authority = new_portal_authority,
        associated_token::token_program = token_program,
    )]
    pub portal_m_account: InterfaceAccount<'info, TokenAccount>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl UpdatePortalAuthority<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        ctx.accounts.global_account.portal_authority = ctx.accounts.new_portal_authority.key();

        if ctx.accounts.portal_m_account.state == AccountState::Frozen {
            thaw_token_account(
                &ctx.accounts.portal_m_account,
                &ctx.accounts.m_mint,
                &ctx.accounts.global_account.to_account_info(),
                &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
                &ctx.accounts.token_program,
            )?;
        }

        Ok(())
    }
}
