use anchor_lang::prelude::*;

use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct UpdatePortalAuthority<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        has_one = admin @ EarnError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, EarnGlobal>,
}

impl UpdatePortalAuthority<'_> {
    pub fn handler(ctx: Context<Self>, new_portal_authority: Pubkey) -> Result<()> {
        ctx.accounts.global_account.portal_authority = new_portal_authority;
        Ok(())
    }
}
