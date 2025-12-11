use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::token::freeze_token_account,
};

#[derive(Accounts)]
pub struct RemoveRegistrarEarner<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = payer.key() == global_account.portal_authority
            || (cfg!(feature = "testing") && payer.key() == global_account.admin) @ EarnError::NotAuthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    /// CHECK: any account can be an earner
    /// part of registrar payload and validated by the bridge
    pub user: UncheckedAccount<'info>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

impl RemoveRegistrarEarner<'_> {
    #[allow(unused_variables)]
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        if ctx.accounts.user_token_account.state != AccountState::Frozen {
            freeze_token_account(
                &ctx.accounts.user_token_account,
                &ctx.accounts.m_mint,
                &ctx.accounts.global_account.to_account_info(),
                &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
                &ctx.accounts.token_program,
            )?;
        }

        Ok(())
    }
}
