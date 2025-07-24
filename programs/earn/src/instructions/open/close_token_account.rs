use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{close_account, CloseAccount, Token2022},
    token_interface::{Mint, TokenAccount},
};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct CloseTokenAccount<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

impl CloseTokenAccount<'_> {
    fn validate(&self) -> Result<()> {
        if self.token_account.amount > 0 {
            return err!(EarnError::NonZeroBalanceError);
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        close_account(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.token_account.to_account_info(),
                destination: ctx.accounts.signer.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ))
    }
}
