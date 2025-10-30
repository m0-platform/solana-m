use anchor_lang::prelude::*;
use common::{FillReportPayload, Payload};

use crate::{
    instructions::{send_message, wormhole_adapter},
    state::AUTHORITY_SEED,
};

#[derive(Accounts)]
pub struct SendFillReport<'info> {
    pub sender: Signer<'info>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: account does not hold data
    pub messenger_authority: UncheckedAccount<'info>,

    #[account(address = wormhole_adapter::ID)]
    /// CHECK: checked against constraint
    pub bridge_adapter: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl SendFillReport<'_> {
    pub fn handler<'info>(
        ctx: Context<'_, '_, '_, 'info, SendFillReport<'info>>,
        order_id: [u8; 32],
        amount_in_to_release: u128,
        amount_out_filled: u128,
        origin_recipient: [u8; 32],
    ) -> Result<()> {
        let message = Payload::FillReport(FillReportPayload {
            order_id,
            amount_in_to_release,
            amount_out_filled,
            origin_recipient,
        });

        send_message(
            ctx.accounts.bridge_adapter.to_account_info(),
            ctx.accounts.sender.to_account_info(),
            ctx.accounts.messenger_authority.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.remaining_accounts.to_vec(),
            message.encode(),
        )
    }
}
