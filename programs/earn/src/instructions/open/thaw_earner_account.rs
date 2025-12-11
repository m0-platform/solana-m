use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, Earner, EARNER_SEED, GLOBAL_SEED},
    utils::token::{has_immutable_owner, thaw_token_account},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct ThawEarnerAccount<'info> {
    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [EARNER_SEED, user.as_ref()],
        bump = earner.bump
    )]
    pub earner: Account<'info, Earner>,

    #[account(
        mut,
        token::mint = global_account.m_mint,
        token::authority = user,
        constraint = has_immutable_owner(&user_token_account) @ EarnError::MutableOwner,
        constraint = user_token_account.state == AccountState::Frozen @ EarnError::InvalidAccount,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl ThawEarnerAccount<'_> {
    pub fn handler(ctx: Context<Self>, user: Pubkey) -> Result<()> {
        // Thaw the user's token account so they can hold $M
        thaw_token_account(
            &ctx.accounts.user_token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
            &ctx.accounts.token_program,
        )?;

        Ok(())
    }
}
