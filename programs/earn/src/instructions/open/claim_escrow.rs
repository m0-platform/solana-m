use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::{
    errors::EarnError,
    state::{EarnGlobal, ESCROW_SEED_PREFIX, GLOBAL_SEED},
    utils::token::transfer_tokens_from_program,
};

#[derive(Accounts)]
pub struct ClaimEscrow<'info> {
    // TODO: think about permissions more in the case of a program owning an account
    pub account_owner: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
        has_one = wm_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    pub wm_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = m_mint,
        token::authority = account_owner,
        token::token_program = token_program,
    )]
    pub m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [ESCROW_SEED_PREFIX, m_token_account.key().as_ref()],
        bump,
        token::mint = wm_mint,
        token::authority = global_account,
        token::token_program = token_program,
    )]
    pub wm_escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        token::mint = wm_mint,
        token::token_program = token_program
    )]
    pub wm_recipient: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl ClaimEscrow<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        // If the escrow account has a non-zero balance,
        // transfer the balance to the recipient account
        if ctx.accounts.wm_escrow.amount > 0 {
            let authority_seeds: &[&[&[u8]]] =
                &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]];

            transfer_tokens_from_program(
                &ctx.accounts.wm_escrow,
                &ctx.accounts.wm_recipient,
                ctx.accounts.wm_escrow.amount,
                &ctx.accounts.wm_mint,
                &ctx.accounts.global_account.to_account_info(),
                authority_seeds,
                &ctx.accounts.token_program,
            )?;
        }

        // TODO: Who should get the refund here?
        ctx.accounts
            .wm_escrow
            .close(ctx.accounts.account_owner.to_account_info())?;

        Ok(())
    }
}
