#![allow(unexpected_cfgs)]

pub mod errors;
pub mod instructions;
pub mod payloads;
pub mod state;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce");

#[program]
pub mod bridge {
    use super::*;

    /// Admin Instructions

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Initialize::handler(ctx)
    }

    /// Outbound Instructions

    pub fn send_token(
        ctx: Context<SendTokens>,
        amount: u64,
        destination_chain_id: u32,
        destination_token: [u8; 32],
        recipient: [u8; 32],
    ) -> Result<()> {
        SendTokens::handler(
            ctx,
            amount,
            destination_chain_id,
            destination_token,
            recipient,
        )
    }

    pub fn send_fill_report(
        ctx: Context<SendFillReport>,
        order_id: [u8; 32],
        amount_in_to_release: u128,
        amount_out_filled: u128,
        origin_recipient: [u8; 32],
    ) -> Result<()> {
        SendFillReport::handler(ctx)
    }

    /// Inbound Instructions

    pub fn receive_message(ctx: Context<ReceiveMessage>, payload: Vec<u8>) -> Result<()> {
        ReceiveMessage::handler(ctx, payload)
    }
}
