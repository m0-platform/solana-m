// earn/lib.rs - top-level program file
#![allow(unexpected_cfgs)]

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;
use utils::merkle_proof::ProofElement;

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

declare_id!("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c");

#[program]
pub mod earn {
    use super::*;

    // Admin instructions

    pub fn initialize(
        ctx: Context<Initialize>,
        earn_authority: Pubkey,
        initial_index: u64,
        claim_cooldown: u64,
    ) -> Result<()> {
        instructions::admin::initialize::handler(ctx, earn_authority, initial_index, claim_cooldown)
    }

    pub fn set_earn_authority(ctx: Context<AdminAction>, new_earn_authority: Pubkey) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    pub fn set_claim_cooldown(ctx: Context<AdminAction>, claim_cooldown: u64) -> Result<()> {
        instructions::admin::set_claim_cooldown::handler(ctx, claim_cooldown)
    }

    // Portal instrutions

    pub fn propagate_index(
        ctx: Context<PropagateIndex>,
        index: u64,
        earner_merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::portal::propagate_index::handler(ctx, index, earner_merkle_root)
    }

    // Earn authority instructions

    pub fn claim_for(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
        instructions::earn_authority::claim_for::handler(ctx, snapshot_balance)
    }

    pub fn complete_claims(ctx: Context<CompleteClaims>) -> Result<()> {
        instructions::earn_authority::complete_claims::handler(ctx)
    }

    // Open instructions

    pub fn add_registrar_earner(
        ctx: Context<AddRegistrarEarner>,
        user: Pubkey,
        proof: Vec<ProofElement>,
    ) -> Result<()> {
        instructions::open::add_registrar_earner::handler(ctx, user, proof)
    }

    pub fn remove_registrar_earner(
        ctx: Context<RemoveRegistrarEarner>,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::open::remove_registrar_earner::handler(ctx, proofs, neighbors)
    }
}
