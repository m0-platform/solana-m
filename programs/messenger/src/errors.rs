use anchor_lang::prelude::*;

#[error_code]
pub enum MessengerError {
    #[msg("Paused")]
    Paused,
    #[msg("Signer is not authorized to perform this action")]
    NotAuthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid extension")]
    InvalidExtension,
    #[msg("Bridge adapter not supported")]
    InvalidBridgeAdapter,
    #[msg("Invalid number of remaining accounts")]
    InvalidRemainingAccounts,
}
