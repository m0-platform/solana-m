use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::PostedVaa;

use crate::{
    config::*,
    error::NTTError,
    messages::ValidatedTransceiverMessage,
    ntt_messages::{ChainId, TransceiverMessage, TransceiverMessageData, WormholeTransceiver},
    payloads::Payload,
    transceivers::accounts::peer::TransceiverPeer,
};

#[derive(Accounts)]
pub struct ReceiveMessage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub config: NotPausedConfig<'info>,

    #[account(
        seeds = [TransceiverPeer::SEED_PREFIX, vaa.emitter_chain().to_be_bytes().as_ref()],
        constraint = peer.address == *vaa.emitter_address() @ NTTError::InvalidTransceiverPeer,
        bump = peer.bump,
    )]
    pub peer: Account<'info, TransceiverPeer>,

    #[account(
        constraint = vaa.message().ntt_manager_payload.payload.to_chain() == config.chain_id @ NTTError::InvalidChainId,
        // NOTE: we don't replay protect VAAs. Instead, we replay protect
        // executing the messages themselves with the [`released`] flag.
    )]
    pub vaa: Account<'info, PostedVaa<TransceiverMessage<WormholeTransceiver, Payload>>>,

    #[account(
        init,
        payer = payer,
        space = 8 + ValidatedTransceiverMessage::<TransceiverMessageData<Payload>>::INIT_SPACE,
        seeds = [
            ValidatedTransceiverMessage::<TransceiverMessageData<Payload>>::SEED_PREFIX,
            vaa.emitter_chain().to_be_bytes().as_ref(),
            vaa.message().ntt_manager_payload.id.as_ref(),
        ],
        bump,
    )]
    // NOTE: in order to handle multiple transceivers, we can just augment the
    // inbox item transfer struct with a bitmap storing which transceivers have
    // attested to the transfer. Then we only release it if there's quorum.
    // We would need to maybe_init this account in that case.
    pub transceiver_message: Account<'info, ValidatedTransceiverMessage<Payload>>,

    pub system_program: Program<'info, System>,
}

pub fn receive_message(ctx: Context<ReceiveMessage>) -> Result<()> {
    let message = ctx.accounts.vaa.message().message_data.clone();
    let chain_id = ctx.accounts.vaa.emitter_chain();
    ctx.accounts
        .transceiver_message
        .set_inner(ValidatedTransceiverMessage {
            from_chain: ChainId { id: chain_id },
            message,
        });

    Ok(())
}
