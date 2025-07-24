/// NOTE: this entire module was copied over from https://github.com/wormhole-foundation/native-token-transfers/tree/main/solana/modules/ntt-messages
/// This was done to remove the ntt-messages dependency and upgrade to anchor v0.31.0
///
pub mod bpf_loader_upgradeable;
pub mod chain_id;
pub mod errors;
pub mod mode;
pub mod ntt_manager;
pub mod transceiver;
pub mod trimmed_amount;
pub mod wormhole;

use anchor_lang::prelude::*;
pub use bpf_loader_upgradeable::*;
pub use chain_id::*;
pub use errors::*;
pub use mode::*;
pub use ntt_manager::*;
pub use transceiver::*;
pub use trimmed_amount::*;
pub use wormhole::*;

pub trait MaybeSpace: Space {}
impl<A: Space> MaybeSpace for A {}
