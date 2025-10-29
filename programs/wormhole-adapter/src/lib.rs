#![allow(unexpected_cfgs)]

mod consts;
mod instructions;
mod state;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("mzWh4w2CAHymGp89Z8VV2nKuCkdSFARS3fEaTBPq14b");

#[program]
pub mod wormhole_adapter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Initialize::handler(ctx)
    }

    pub fn receive_message(
        ctx: Context<ReceiveMessage>,
        guardian_set_index: u32,
        vaa_body: Vec<u8>,
    ) -> Result<()> {
        ReceiveMessage::handler(ctx, guardian_set_index, vaa_body)
    }

    pub fn relay_message(ctx: Context<RelayMessage>, message: Vec<u8>) -> Result<()> {
        RelayMessage::handler(ctx, message)
    }
}
