use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[constant]
pub const AUTHORITY_SEED: &[u8] = b"authority";

#[account]
#[derive(InitSpace)]
pub struct BridgeGlobal {
    pub bump: u8,
    pub admin: Pubkey,
    pub paused: bool,
}

impl BridgeGlobal {
    pub const SIZE: usize = BridgeGlobal::INIT_SPACE + BridgeGlobal::DISCRIMINATOR.len();
}
