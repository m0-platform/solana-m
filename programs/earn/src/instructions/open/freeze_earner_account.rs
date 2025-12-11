use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, EARNER_SEED, GLOBAL_SEED},
    utils::token::freeze_token_account,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct FreezeEarnerAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [EARNER_SEED, user.as_ref()],
        bump
    )]
    /// CHECK: this account is expected to be closed
    pub earner: AccountInfo<'info>,

    /// We originally allowed this account to be validated later and potentially be closed,
    /// but this is not necessary anymore since if the account is closed, it will be frozen
    /// when re-initialized. Therefore, closing a token account is equivalent to removing an earner.
    /// For this reason, we also know that if there is a thawed token account, it went through the
    /// add registrar earner flow and thus the owner is the original since we required it to be immutable.
    #[account(
        mut,
        token::mint = global_account.m_mint,
        constraint = user_token_account.state == AccountState::Initialized @ EarnError::InvalidAccount,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl FreezeEarnerAccount<'_> {
    fn validate(&self) -> Result<()> {
        // Verify the user is not in the approved earners list
        if !self.earner.to_account_info().data_is_empty() {
            return err!(EarnError::EarnerApproved);
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>, user: Pubkey) -> Result<()> {
        // Freeze the user's token account so they can no longer hold $M
        freeze_token_account(
            &ctx.accounts.user_token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
            &ctx.accounts.token_program,
        )?;

        Ok(())
    }
}
