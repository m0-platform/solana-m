use anchor_lang::prelude::*;

use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    errors::EarnError,
    state::{EarnGlobal, Earner, EARNER_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddEarner<'info> {
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
        init_if_needed,
        payer = payer,
        space = ANCHOR_DISCRIMINATOR_SIZE + Earner::INIT_SPACE,
        seeds = [EARNER_SEED, user.as_ref()],
        bump
    )]
    pub earner: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

impl AddEarner<'_> {
    #[allow(unused_variables)]
    pub fn handler(ctx: Context<Self>, user: Pubkey) -> Result<()> {
        ctx.accounts.earner.set_inner(Earner {
            bump: ctx.bumps.earner,
        });

        Ok(())
    }
}
