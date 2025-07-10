use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use earn::{constants::INDEX_SCALE_F64, utils::conversion::get_scaled_ui_config};

use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct Sync<'info> {
    pub earn_authority: Signer<'info>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
        has_one = earn_authority @ ExtError::NotAuthorized,
        has_one = m_mint @ ExtError::InvalidAccount,
    )]
    pub global_account: Account<'info, ExtGlobal>,
}

pub fn handler(ctx: Context<Sync>) -> Result<()> {
    // Convert the multiplier to a u64 index
    let scaled_ui_config = get_scaled_ui_config(&ctx.accounts.m_mint)?;
    let current_multiplier: f64 = scaled_ui_config.new_multiplier.into();
    let timestamp: i64 = scaled_ui_config.new_multiplier_effective_timestamp.into();
    let current_index: u64 = (INDEX_SCALE_F64 * current_multiplier).trunc() as u64;

    // Update the local data
    ctx.accounts.global_account.index = current_index;
    ctx.accounts.global_account.timestamp = timestamp as u64;

    emit!(SyncIndexUpdate {
        index: ctx.accounts.global_account.index,
        ts: ctx.accounts.global_account.timestamp,
    });

    Ok(())
}

#[event]
pub struct SyncIndexUpdate {
    pub index: u64,
    pub ts: u64,
}
