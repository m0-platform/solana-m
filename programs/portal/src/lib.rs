#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod bitmap;
pub mod clock;
pub mod config;
pub mod error;
pub mod instructions;
pub mod messages;
pub mod ntt_messages;
pub mod payloads;
pub mod peer;
pub mod pending_token_authority;
pub mod queue;
pub mod registered_transceiver;
pub mod spl_multisig;
pub mod transceivers;

use transceivers::wormhole::instructions::*;

use instructions::*;

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    // Required fields
    name: "M Portal Program",
    project_url: "https://m0.org/",
    contacts: "email:security@m0.xyz",
    policy: "https://github.com/m0-foundation/solana-m/blob/main/SECURITY.md",
    // Optional Fields
    preferred_languages: "en",
    source_code: "https://github.com/m0-foundation/solana-m/tree/main/programs/portal",
    auditors: "Asymmetric Research, Halborn"
}

declare_id!("mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY");

pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";

/// The seed for the session authority account.
///
/// These accounts are used in the `transfer_*` instructions. The user first
/// approves the session authority to spend the tokens, and then the session
/// authority burns or locks the tokens.
/// This is to avoid the user having to pass their own authority to the program,
/// which in general is dangerous, especially for upgradeable programs.
///
/// There is a session authority associated with each transfer, and is seeded by
/// the sender's pubkey, and (the hash of) all the transfer arguments.
/// These seeds essentially encode the user's intent when approving the
/// spending.
///
/// In practice, the approve instruction is going to be atomically bundled with
/// the transfer instruction, so this encoding makes no difference.
/// However, it does allow it to be done in a separate transaction without the
/// risk of a malicious actor redirecting the funds by frontrunning the transfer
/// instruction.
/// In other words, the transfer instruction has no degrees of freedom; all the
/// arguments are determined in the approval step. Then transfer can be
/// permissionlessly invoked by anyone (even if in practice it's going to be the
/// user, atomically).
pub const SESSION_AUTHORITY_SEED: &[u8] = b"session_authority";

pub const VERSION: &str = "3.0.0";

#[program]
pub mod portal {
    use super::*;

    pub fn initialize_multisig(
        ctx: Context<InitializeMultisig>,
        args: InitializeArgs,
    ) -> Result<()> {
        instructions::initialize_multisig(ctx, args)
    }

    pub fn set_destination_addresses(
        ctx: Context<SetDestinationAddresses>,
        evm_token: [u8; 32],
        evm_wrapped_token: [u8; 32],
    ) -> Result<()> {
        instructions::set_destination_addresses(ctx, evm_token, evm_wrapped_token)
    }

    pub fn initialize_lut(ctx: Context<InitializeLUT>, recent_slot: u64) -> Result<()> {
        instructions::initialize_lut(ctx, recent_slot)
    }

    pub fn version(_ctx: Context<Version>) -> Result<String> {
        Ok(VERSION.to_string())
    }

    pub fn transfer_burn<'info>(
        ctx: Context<'_, '_, '_, 'info, TransferBurn<'info>>,
        args: TransferArgs,
    ) -> Result<()> {
        instructions::transfer_burn(ctx, args)
    }

    pub fn redeem(ctx: Context<Redeem>, args: RedeemArgs) -> Result<()> {
        instructions::redeem(ctx, args)
    }

    pub fn release_inbound_mint_multisig<'info>(
        ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintMultisig<'info>>,
        args: ReleaseInboundArgs,
    ) -> Result<()> {
        instructions::release_inbound_mint_multisig(ctx, args)
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>) -> Result<()> {
        instructions::transfer_ownership(ctx)
    }

    pub fn transfer_ownership_one_step_unchecked(ctx: Context<TransferOwnership>) -> Result<()> {
        instructions::transfer_ownership_one_step_unchecked(ctx)
    }

    pub fn claim_ownership(ctx: Context<ClaimOwnership>) -> Result<()> {
        instructions::claim_ownership(ctx)
    }

    pub fn accept_token_authority(ctx: Context<AcceptTokenAuthority>) -> Result<()> {
        instructions::accept_token_authority(ctx)
    }

    pub fn set_token_authority(ctx: Context<SetTokenAuthorityChecked>) -> Result<()> {
        instructions::set_token_authority(ctx)
    }

    pub fn set_token_authority_one_step_unchecked(
        ctx: Context<SetTokenAuthorityUnchecked>,
    ) -> Result<()> {
        instructions::set_token_authority_one_step_unchecked(ctx)
    }

    pub fn revert_token_authority(ctx: Context<RevertTokenAuthority>) -> Result<()> {
        instructions::revert_token_authority(ctx)
    }

    pub fn claim_token_authority(ctx: Context<ClaimTokenAuthority>) -> Result<()> {
        instructions::claim_token_authority(ctx)
    }

    pub fn set_paused(ctx: Context<SetPaused>, pause: bool) -> Result<()> {
        instructions::set_paused(ctx, pause)
    }

    pub fn set_peer(ctx: Context<SetPeer>, args: SetPeerArgs) -> Result<()> {
        instructions::set_peer(ctx, args)
    }

    pub fn register_transceiver(ctx: Context<RegisterTransceiver>) -> Result<()> {
        instructions::register_transceiver(ctx)
    }

    pub fn set_outbound_limit(
        ctx: Context<SetOutboundLimit>,
        args: SetOutboundLimitArgs,
    ) -> Result<()> {
        instructions::set_outbound_limit(ctx, args)
    }

    pub fn set_inbound_limit(
        ctx: Context<SetInboundLimit>,
        args: SetInboundLimitArgs,
    ) -> Result<()> {
        instructions::set_inbound_limit(ctx, args)
    }

    // standalone transceiver stuff

    pub fn set_wormhole_peer(
        ctx: Context<SetTransceiverPeer>,
        args: SetTransceiverPeerArgs,
    ) -> Result<()> {
        transceivers::wormhole::instructions::set_transceiver_peer(ctx, args)
    }

    pub fn receive_wormhole_message(ctx: Context<ReceiveMessage>) -> Result<()> {
        transceivers::wormhole::instructions::receive_message(ctx)
    }

    pub fn release_wormhole_outbound(
        ctx: Context<ReleaseOutbound>,
        args: ReleaseOutboundArgs,
    ) -> Result<()> {
        transceivers::wormhole::instructions::release_outbound(ctx, args)
    }

    pub fn broadcast_wormhole_id(ctx: Context<BroadcastId>) -> Result<()> {
        transceivers::wormhole::instructions::broadcast_id(ctx)
    }

    pub fn broadcast_wormhole_peer(
        ctx: Context<BroadcastPeer>,
        args: BroadcastPeerArgs,
    ) -> Result<()> {
        transceivers::wormhole::instructions::broadcast_peer(ctx, args)
    }
}

#[cfg(not(feature = "cpi"))]
#[derive(Accounts)]
pub struct Version {}
