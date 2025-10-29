use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct WormholeGlobal {
    pub bump: u8,
    pub admin: Pubkey,
    pub paused: bool,
}

impl WormholeGlobal {
    pub const SIZE: usize = WormholeGlobal::INIT_SPACE + WormholeGlobal::DISCRIMINATOR.len();
}
