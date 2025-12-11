use anchor_lang::prelude::*;

#[error_code]
pub enum EarnError {
    #[msg("Already claimed for user.")]
    AlreadyClaimed,
    #[msg("Rewards exceed max yield.")]
    ExceedsMaxYield,
    #[msg("Invalid signer.")]
    NotAuthorized,
    #[msg("Invalid parameter.")]
    InvalidParam,
    #[msg("User is already an earner.")]
    AlreadyEarns,
    #[msg("There is no active claim to complete.")]
    NoActiveClaim,
    #[msg("User is not earning.")]
    NotEarning,
    #[msg("An optional account is required in this case, but not provided.")]
    RequiredAccountMissing,
    #[msg("Account does not match the expected key.")]
    InvalidAccount,
    #[msg("Account is not currently active.")]
    NotActive,
    #[msg("Merkle proof verification failed.")]
    InvalidProof,
    #[msg("Token account owner is required to be immutable.")]
    MutableOwner,
    #[msg("Invalid Mint.")]
    InvalidMint,
    #[msg("Math overflow error.")]
    MathOverflow,
    #[msg("Math underflow error.")]
    MathUnderflow,
    #[msg("Type conversion error.")]
    TypeConversionError,
    #[msg("The specified earner is approved.")]
    EarnerApproved,
}
