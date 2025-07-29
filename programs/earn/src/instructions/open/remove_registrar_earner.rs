// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::{
        merkle_proof::{verify_not_in_tree, ProofElement},
        token::freeze_token_account,
    },
};

#[derive(Accounts)]
pub struct RemoveRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

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

impl RemoveRegistrarEarner<'_> {
    fn validate(&self, proofs: Vec<Vec<ProofElement>>, neighbors: Vec<[u8; 32]>) -> Result<()> {
        // Verify the user is not in the approved earners list
        verify_not_in_tree(
            self.global_account.earner_merkle_root,
            self.user_token_account.owner.to_bytes(),
            proofs,
            neighbors,
        )?;

        // Don't allow removal of token accounts owned by the portal token authority or the ext swap global account
        if self.user_token_account.owner == self.global_account.portal_authority
            || self.user_token_account.owner == self.global_account.ext_swap_global_account
        {
            return err!(EarnError::NotAuthorized);
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(proofs, neighbors))]
    pub fn handler(
        ctx: Context<RemoveRegistrarEarner>,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
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
