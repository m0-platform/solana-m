use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

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
