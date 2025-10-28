use anchor_lang::prelude::*;

use crate::state::{BridgeGlobal, GLOBAL_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space =  BridgeGlobal::SIZE,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub swap_global: Account<'info, BridgeGlobal>,

    pub system_program: Program<'info, System>,
}

impl Initialize<'_> {
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        Ok(())
    }
}
