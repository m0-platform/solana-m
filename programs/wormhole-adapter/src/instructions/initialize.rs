use anchor_lang::prelude::*;

use crate::state::{WormholeGlobal, GLOBAL_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space =  WormholeGlobal::size(0),
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub wormhole_global: Account<'info, WormholeGlobal>,

    pub system_program: Program<'info, System>,
}

impl Initialize<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        ctx.accounts.wormhole_global.set_inner(WormholeGlobal {
            bump: ctx.bumps.wormhole_global,
            admin: ctx.accounts.admin.key(),
            paused: false,
            peers: Vec::new(),
        });

        Ok(())
    }
}
