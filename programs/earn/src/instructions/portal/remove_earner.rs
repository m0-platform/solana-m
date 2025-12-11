use anchor_lang::prelude::*;

use crate::{
    errors::EarnError,
    state::{EarnGlobal, Earner, EARNER_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RemoveEarner<'info> {
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
    )]
    pub global_account: Account<'info, EarnGlobal>,

    #[account(
        mut,
        close = payer,
        seeds = [EARNER_SEED, user.as_ref()],
        bump = earner.bump
    )]
    pub earner: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

impl RemoveEarner<'_> {
    #[allow(unused_variables)]
    pub fn handler(ctx: Context<Self>, user: Pubkey) -> Result<()> {
        Ok(())
    }
}
