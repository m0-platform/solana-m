use anchor_lang::prelude::*;

#[error_code]
pub enum WormholeError {
    #[msg("Paused")]
    Paused,
    #[msg("Invalid peer address or chain")]
    InvalidPeer,
    #[msg("Invalid VAA")]
    InvalidVaa,
    #[msg("RESOLVER_RESULT_ACCOUNT needs to be writable")]
    InvalidReturnAccount,
    #[msg("Missing payer account")]
    MissingPayerAccount,
}
