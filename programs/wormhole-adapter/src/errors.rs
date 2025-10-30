use anchor_lang::prelude::*;

#[error_code]
pub enum WormholeError {
    #[msg("Paused")]
    Paused,
    #[msg("Invalid peer address or chain")]
    InvalidPeer,
    #[msg("Invalid VAA")]
    InvalidVaa,
}
