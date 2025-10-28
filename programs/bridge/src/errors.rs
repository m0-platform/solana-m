use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    #[msg("Signer is not authorized to perform this action")]
    NotAuthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
}
