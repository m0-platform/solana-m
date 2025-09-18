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
        merkle_proof::{verify_in_tree, ProofElement},
        token::{has_immutable_owner, thaw_token_account},
    },
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddRegistrarEarner<'info> {
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
        mut,
        token::mint = global_account.m_mint,
        token::authority = user,
        constraint = has_immutable_owner(&user_token_account) @ EarnError::MutableOwner,
        constraint = user_token_account.state == AccountState::Frozen @ EarnError::InvalidAccount,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

impl AddRegistrarEarner<'_> {
    fn validate(&self, user: Pubkey, proof: Vec<ProofElement>) -> Result<()> {
        // Ensure the user is not the default public key (system program)
        if user == Pubkey::default() {
            return err!(EarnError::InvalidParam);
        }

        // Verify the user is in the approved earners list
        verify_in_tree(
            self.global_account.earner_merkle_root,
            user.to_bytes(),
            proof,
        )?;

        Ok(())
    }

    #[access_control(ctx.accounts.validate(user, proof))]
    pub fn handler(ctx: Context<Self>, user: Pubkey, proof: Vec<ProofElement>) -> Result<()> {
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
