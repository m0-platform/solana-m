#![allow(unexpected_cfgs)]

mod consts;
mod errors;
mod instructions;
mod state;

use anchor_lang::prelude::*;
use executor_account_resolver_svm::{InstructionGroups, Resolver, RESOLVER_EXECUTE_VAA_V1};
use instructions::*;

declare_id!("mzWh4w2CAHymGp89Z8VV2nKuCkdSFARS3fEaTBPq14b");

#[program]
pub mod wormhole_adapter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Initialize::handler(ctx)
    }

    pub fn relay_message(ctx: Context<RelayMessage>, message: Vec<u8>) -> Result<()> {
        RelayMessage::handler(ctx, message)
    }

    pub fn receive_message(
        ctx: Context<ReceiveMessage>,
        guardian_set_index: u32,
        vaa_body: Vec<u8>,
    ) -> Result<()> {
        ReceiveMessage::handler(ctx, guardian_set_index, vaa_body)
    }

    #[instruction(discriminator = &RESOLVER_EXECUTE_VAA_V1)]
    pub fn resolve_execute(
        ctx: Context<ResolveExecuteVaa>,
        vaa_body: Vec<u8>,
    ) -> Result<Resolver<InstructionGroups>> {
        ResolveExecuteVaa::handler(ctx, vaa_body)
    }
}
