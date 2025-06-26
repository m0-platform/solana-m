// ext_earn/lib.rs - top-level program file
#![allow(unexpected_cfgs)]

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    // Required fields
    name: "wM Earn Program",
    project_url: "https://m0.org/",
    contacts: "email:security@m0.xyz",
    policy: "https://github.com/m0-foundation/solana-m/blob/main/SECURITY.md",
    // Optional Fields
    preferred_languages: "en",
    source_code: "https://github.com/m0-foundation/solana-m/tree/main/programs/ext_earn",
    auditors: "Sec3, Halborn, Ottersec"
}

declare_id!("wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko");

#[program]
pub mod ext_earn {
    use super::*;

    // Admin instructions

    pub fn initialize(ctx: Context<Initialize>, earn_authority: Pubkey) -> Result<()> {
        instructions::admin::initialize::handler(ctx, earn_authority)
    }

    pub fn set_earn_authority(
        ctx: Context<SetEarnAuthority>,
        new_earn_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    pub fn set_m_mint(ctx: Context<SetMMint>) -> Result<()> {
        instructions::admin::set_m_mint::handler(ctx)
    }

    pub fn add_earn_manager(
        ctx: Context<AddEarnManager>,
        earn_manager: Pubkey,
        fee_bps: u64,
    ) -> Result<()> {
        instructions::admin::add_earn_manager::handler(ctx, earn_manager, fee_bps)
    }

    pub fn remove_earn_manager(ctx: Context<RemoveEarnManager>) -> Result<()> {
        instructions::admin::remove_earn_manager::handler(ctx)
    }

    pub fn add_wrap_authority(
        ctx: Context<AddWrapAuthority>,
        new_wrap_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::add_wrap_authority::handler(ctx, new_wrap_authority)
    }

    pub fn remove_wrap_authority(
        ctx: Context<RemoveWrapAuthority>,
        wrap_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::remove_wrap_authority::handler(ctx, wrap_authority)
    }

    // Earn authority instructions

    pub fn claim_for(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
        instructions::earn_authority::claim_for::handler(ctx, snapshot_balance)
    }

    pub fn sync(ctx: Context<Sync>) -> Result<()> {
        instructions::earn_authority::sync::handler(ctx)
    }

    // Earn manager instructions

    pub fn add_earner(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
        instructions::earn_manager::add_earner::handler(ctx, user)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>) -> Result<()> {
        instructions::earn_manager::remove_earner::handler(ctx)
    }

    pub fn configure_earn_manager(
        ctx: Context<ConfigureEarnManager>,
        fee_bps: Option<u64>,
    ) -> Result<()> {
        instructions::earn_manager::configure::handler(ctx, fee_bps)
    }

    pub fn transfer_earner(ctx: Context<TransferEarner>, to_earn_manager: Pubkey) -> Result<()> {
        instructions::earn_manager::transfer_earner::handler(ctx, to_earn_manager)
    }

    // Earner (or their Earn Manager) instructions

    pub fn set_recipient(ctx: Context<SetRecipient>) -> Result<()> {
        instructions::earner::set_recipient::handler(ctx)
    }

    // Open instructions

    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        instructions::open::wrap::handler(ctx, amount)
    }

    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        instructions::open::unwrap::handler(ctx, amount)
    }

    pub fn remove_orphaned_earner(ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
        instructions::open::remove_orphaned_earner::handler(ctx)
    }
}
