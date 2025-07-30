use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};
use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::token::{freeze_token_account, thaw_token_account, transfer_tokens_from_program},
};

// This instruction allows the admin to recover M from a frozen token account and transfer it to a new token account.

#[derive(Accounts)]
pub struct RecoverM<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
        has_one = admin @ EarnError::NotAuthorized,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = global_account.m_mint,
        constraint = source_token_account.state == AccountState::Frozen @ EarnError::InvalidAccount,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = global_account.m_mint,
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl RecoverM<'_> {
    pub fn handler(ctx: Context<Self>, amount: Option<u64>) -> Result<()> {
        // Transfer the amount specified or, if not specified, the entire balance
        // Amounts greater than the balance will revert during the transfer
        let recover_amount = amount.unwrap_or(ctx.accounts.source_token_account.amount);

        let authority_seeds: &[&[&[u8]]] = &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]];

        // Thaw the source token account to allow the transfer
        thaw_token_account(
            &ctx.accounts.source_token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            authority_seeds,
            &ctx.accounts.token_program,
        )?;

        // Check the state of the destination token account
        // If it is frozen, thaw it as well
        if ctx.accounts.destination_token_account.state == AccountState::Frozen {
            thaw_token_account(
                &ctx.accounts.destination_token_account,
                &ctx.accounts.m_mint,
                &ctx.accounts.global_account.to_account_info(),
                authority_seeds,
                &ctx.accounts.token_program,
            )?;
        }

        // Transfer the tokens from the source account to the destination account
        // This only works because the global_account is a permanent delegate
        // on the M mint, allowing it to transfer tokens from any account
        transfer_tokens_from_program(
            &ctx.accounts.source_token_account,
            &ctx.accounts.destination_token_account,
            recover_amount,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            authority_seeds,
            &ctx.accounts.token_program,
        )?;

        // Re-freeze the source token account
        freeze_token_account(
            &ctx.accounts.source_token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            authority_seeds,
            &ctx.accounts.token_program,
        )?;

        Ok(())
    }
}

