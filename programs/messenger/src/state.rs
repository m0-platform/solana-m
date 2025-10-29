use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[constant]
pub const AUTHORITY_SEED: &[u8] = b"authority";

#[account]
#[derive(InitSpace)]
pub struct MessengerGlobal {
    pub bump: u8,
    pub admin: Pubkey,
    pub paused: bool,
}

impl MessengerGlobal {
    pub const SIZE: usize = MessengerGlobal::INIT_SPACE + MessengerGlobal::DISCRIMINATOR.len();
}
