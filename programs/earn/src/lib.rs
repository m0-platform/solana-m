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

declare_id!("mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z");

#[program]
pub mod earn {
    use super::*;

    // Admin instructions

    #[cfg(not(feature = "migrate"))]
    pub fn initialize(ctx: Context<Initialize>, current_index: u64) -> Result<()> {
        Initialize::handler(ctx, current_index)
    }

    #[cfg(feature = "migrate")]
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Initialize::handler(ctx, 0)
    }

    // TODO add admin instructions for updating global values

    // Portal instrutions

    pub fn propagate_index(
        ctx: Context<PropagateIndex>,
        index: u64,
        earner_merkle_root: [u8; 32],
    ) -> Result<()> {
        PropagateIndex::handler(ctx, index, earner_merkle_root)
    }

    // Open instructions

    pub fn add_registrar_earner(
        ctx: Context<AddRegistrarEarner>,
        user: Pubkey,
        proof: Vec<ProofElement>,
    ) -> Result<()> {
        AddRegistrarEarner::handler(ctx, user, proof)
    }

    pub fn remove_registrar_earner(
        ctx: Context<RemoveRegistrarEarner>,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        RemoveRegistrarEarner::handler(ctx, proofs, neighbors)
    }
}
