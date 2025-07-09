use anchor_lang::prelude::*;

pub mod initialize;
pub use initialize::*;

use crate::{
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct AdminAction<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        has_one = admin @ EarnError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, EarnGlobal>,
}
