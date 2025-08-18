use anchor_lang::prelude::*;

pub const DISCRIMINATOR_SIZE: usize = 8;

#[event]
pub struct BridgeEvent {
    pub amount: i64,
    pub token_supply: u64,
    pub from: [u8; 32],
    pub to: [u8; 32],
    pub wormhole_chain_id: u16,
}

#[event]
pub struct IndexUpdate {
    pub index: u64,
    pub ts: u64,
    pub supply: u64,
    pub max_yield: u64,
}

#[event]
pub struct IndexUpdateV2 {
    pub index: u64,
    pub ts: i64,
    pub supply: u64,
    pub current_multiplier: f64,
    pub new_multiplier: f64,
}
