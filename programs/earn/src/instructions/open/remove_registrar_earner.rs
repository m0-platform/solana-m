// earn/instructions/open/remove_registrar_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Token2022, TokenAccount};

// local dependencies
use crate::{
    errors::EarnError,
    state::{Earner, Global, EARNER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_not_in_tree, ProofElement},
};

#[derive(Accounts)]
pub struct RemoveRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        close = signer,
        has_one = user_token_account @ EarnError::InvalidAccount,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    /// CHECK: we validate this manually in the handler so we can
    /// proceed with the removal of the earner account even if the
    /// token account is closed. It must be a token account
    /// because we verified the address when creating the earner account
    /// and are checking here that it matches the pubkey on the earner account
    pub user_token_account: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<RemoveRegistrarEarner>,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // There are three cases we need to handle with this function:
    // 1. the user token account is initialized and the owner is the user on the earner account
    //    -> use the current token account authority / original user for the earner account (they are the same) to verify the merkle proof
    // 2. the user token account is initialized and the owner is not the original user for the earner account
    //    -> use the current token account authority to verify the merkle proof
    // 3. the user token account is closed
    //    -> use the original user for the earner account to verify the merkle proof
    // Thus, we can determine which pubkey to use based on the status of the token account
    let user_bytes: [u8; 32] = if ctx.accounts.user_token_account.owner != &Token2022::id()
        || ctx.accounts.user_token_account.lamports() == 0
    {
        // The user token account is closed or not initialized
        // Use the original user for the earner account
        ctx.accounts.earner_account.user.to_bytes()
    } else {
        // The user token account is initialized
        // Use the owner of the token account
        let token_account_data = ctx.accounts.user_token_account.try_borrow_mut_data()?;

        TokenAccount::try_deserialize(&mut token_account_data.as_ref())?
            .owner
            .to_bytes()
    };

    // Verify the user is not in the approved earners list
    verify_not_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        user_bytes,
        proofs,
        neighbors,
    )?;

    Ok(())
}
