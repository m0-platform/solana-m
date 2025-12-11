// earn/lib.rs - top-level program file
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
    name: "M Earn Program",
    project_url: "https://m0.org/",
    contacts: "email:security@m0.xyz",
    policy: "https://github.com/m0-foundation/solana-m/blob/main/SECURITY.md",
    // Optional Fields
    preferred_languages: "en",
    source_code: "https://github.com/m0-foundation/solana-m/tree/main/programs/earn",
    auditors: "Asymmetric Research, Sec3, OtterSec, Halborn"
}

declare_id!("mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z");

#[program]
pub mod earn {
    use super::*;

    // Admin instructions

    #[cfg(feature = "migrate")]
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Initialize::handler(ctx, 0)
    }

    #[cfg(not(feature = "migrate"))]
    pub fn initialize(ctx: Context<Initialize>, current_index: u64) -> Result<()> {
        Initialize::handler(ctx, current_index)
    }

    pub fn recover_m(ctx: Context<RecoverM>, amount: Option<u64>) -> Result<()> {
        RecoverM::handler(ctx, amount)
    }

    // Portal instrutions

    pub fn propagate_index(ctx: Context<PropagateIndex>, index: u64) -> Result<()> {
        PropagateIndex::handler(ctx, index)
    }

    pub fn add_earner(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
        AddEarner::handler(ctx, user)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>, user: Pubkey) -> Result<()> {
        RemoveEarner::handler(ctx, user)
    }

    // Open instructions

    pub fn add_registrar_earner(ctx: Context<ThawEarnerAccount>, user: Pubkey) -> Result<()> {
        ThawEarnerAccount::handler(ctx, user)
    }

    pub fn remove_registrar_earner(ctx: Context<FreezeEarnerAccount>, user: Pubkey) -> Result<()> {
        FreezeEarnerAccount::handler(ctx, user)
    }
}
