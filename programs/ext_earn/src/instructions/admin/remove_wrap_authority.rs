use anchor_lang::prelude::*;

use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct RemoveWrapAuthority<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ ExtError::NotAuthorized,
    )]
    pub global_account: Account<'info, ExtGlobal>,
}

pub fn handler(ctx: Context<RemoveWrapAuthority>, wrap_authority: Pubkey) -> Result<()> {
    if !ctx
        .accounts
        .global_account
        .wrap_authorities
        .contains(&wrap_authority)
    {
        return err!(ExtError::InvalidParam);
    }

    ctx.accounts
        .global_account
        .wrap_authorities
        .retain(|&x| !x.eq(&wrap_authority));

    Ok(())
}
