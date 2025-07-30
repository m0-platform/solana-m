use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

// The `Global` account holds configuration and state for the earn program.
// It also serves as a signer for permissions granted to the earn program.
// We do this in order to reduce the number of accounts required for program instructions.

#[account]
#[derive(InitSpace)]
pub struct EarnGlobal {
    pub admin: Pubkey,                // can update config values
    pub m_mint: Pubkey,               // $M mint
    pub portal_authority: Pubkey,     // portal authority that propogates indexes and roots
    pub ext_swap_global_account: Pubkey, // global account for the extension swap program (owner of its intermediate account)
    pub earner_merkle_root: [u8; 32], // merkle root for earners
    pub bump: u8,                     // bump seed on this PDA
}

// Seed used by the Portal program to derive the token authority PDA.
// We include it here as a convenience instead of importing it from the Portal program.
// This avoids a circular dependency between the earn and portal programs.
pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
