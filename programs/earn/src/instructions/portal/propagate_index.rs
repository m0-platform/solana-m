// external depenencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::conversion::{get_scaled_ui_config, index_to_multiplier, update_multiplier},
};

#[derive(Accounts)]
pub struct PropagateIndex<'info> {
    #[account(
        constraint = signer.key() == global_account.portal_authority
            || (cfg!(feature = "testing") && signer.key() == global_account.admin) @ EarnError::NotAuthorized 
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        has_one = m_mint,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    #[account(mut)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
}

impl PropagateIndex<'_> {
    pub fn handler(
        ctx: Context<PropagateIndex>,
        new_index: u64,
        earner_merkle_root: [u8; 32],
    ) -> Result<()> {
        let scaled_ui_config = get_scaled_ui_config(&ctx.accounts.m_mint)?;
        let current_multiplier: f64 = scaled_ui_config.new_multiplier.into();
        let new_multiplier = index_to_multiplier(new_index)?;

        // Check if the new multiplier is greater than or equal to the previously seen multiplier.
        if new_multiplier >= current_multiplier {
            ctx.accounts.global_account.index = new_index;

            // If so, update the merkle root if it is non-zero.
            // We don't necessarily need the second check if we know updates only come
            // from mainnet. However, it provides some protection against staleness
            // in the event non-zero roots are sent from another chain.
            if earner_merkle_root != [0u8; 32] {
                ctx.accounts.global_account.earner_merkle_root = earner_merkle_root;
            }

            // If the new multiplier is strictly greater than the current one, update the multiplier.
            if new_multiplier > current_multiplier {
                let timestamp = Clock::get()?.unix_timestamp;

                update_multiplier(
                    &mut ctx.accounts.m_mint,
                    &ctx.accounts.global_account.to_account_info(),
                    &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
                    &ctx.accounts.token_program,
                    new_multiplier,
                    timestamp,
                )?;

                emit!(IndexUpdate {
                    index: new_index,
                    ts: timestamp,
                });
            }
        }

        Ok(())
    }
}

#[event]
pub struct IndexUpdate {
    pub index: u64,
    pub ts: i64,
}
