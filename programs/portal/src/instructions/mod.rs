declare_program!(ext_swap);

pub mod admin;
pub mod initialize;
pub mod luts;
pub mod redeem;
pub mod release_inbound;
pub mod release_inbound_extension;
pub mod transfer;
pub mod transfer_extension;

pub use admin::*;
use anchor_lang::prelude::*;
pub use initialize::*;
pub use luts::*;
pub use redeem::*;
pub use release_inbound::*;
pub use release_inbound_extension::*;
pub use transfer::*;
pub use transfer_extension::*;

#[event]
pub struct BridgeEvent {
    pub amount: i64,
    pub token_supply: u64,
    pub from: [u8; 32],
    pub to: [u8; 32],
    pub wormhole_chain_id: u16,
}
