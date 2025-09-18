use anchor_lang::{prelude::*, solana_program::pubkey};

pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

pub const PORTAL_PROGRAM: Pubkey = pubkey!("mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY");

pub const INDEX_SCALE_F64: f64 = 1e12f64;
pub const INDEX_SCALE_U64: u64 = 1_000_000_000_000u64;
