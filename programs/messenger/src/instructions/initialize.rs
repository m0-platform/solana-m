use anchor_lang::prelude::*;

use crate::state::{MessengerGlobal, GLOBAL_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space =  MessengerGlobal::SIZE,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub swap_global: Account<'info, MessengerGlobal>,

    pub system_program: Program<'info, System>,
}

impl Initialize<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        ctx.accounts.swap_global.set_inner(MessengerGlobal {
            admin: ctx.accounts.admin.key(),
            bump: ctx.bumps.swap_global,
            paused: false,
        });

        Ok(())
    }
}
