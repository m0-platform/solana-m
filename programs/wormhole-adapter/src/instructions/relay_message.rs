use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{
    consts::{CORE_BRIDGE_CONFIG, CORE_BRIDGE_FEE_COLLECTOR, CORE_BRIDGE_PROGRAM_ID},
    instructions::{
        messenger,
        wormhole_post_message_shim::{self, program::WormholePostMessageShim, types::Finality},
    },
    state::{WormholeGlobal, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct RelayMessage<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    #[account(
        constraint = !wormhole_global.paused,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub wormhole_global: Account<'info, WormholeGlobal>,

    #[account(
        seeds = [b"authority"], 
        seeds::program = messenger::ID,
        bump
    )]
    /// Only relay messages coming from the Messenger program
    messenger_authority: Signer<'info>,

    #[account(
        mut,
        address = CORE_BRIDGE_CONFIG
    )]
    /// CHECK: Wormhole bridge config. [`wormhole::post_message`] requires this account be mutable.
    pub bridge: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [&emitter.key.to_bytes()],
        seeds::program = wormhole_post_message_shim::ID,
        bump
    )]
    /// CHECK: Wormhole Message. [`wormhole::post_message`] requires this account be signer and mutable.
    pub message: UncheckedAccount<'info>,

    #[account(
        seeds = [b"emitter"],
        bump
    )]
    /// CHECK: emitter enforced on the CPI
    pub emitter: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"Sequence", &emitter.key.to_bytes()], 
        seeds::program = CORE_BRIDGE_PROGRAM_ID,
        bump
    )]
    /// CHECK: Emitter's sequence account. [`wormhole::post_message`] requires this account be mutable.
    pub sequence: UncheckedAccount<'info>,

    #[account(mut, address = CORE_BRIDGE_FEE_COLLECTOR)]
    /// CHECK: Wormhole fee collector. [`wormhole::post_message`] requires this account be mutable.
    pub fee_collector: UncheckedAccount<'info>,

    pub clock: Sysvar<'info, Clock>,

    pub system_program: Program<'info, System>,

    #[account(address = CORE_BRIDGE_PROGRAM_ID)]
    /// CHECK: Wormhole program.
    pub wormhole_program: UncheckedAccount<'info>,

    #[account(
        seeds = [b"__event_authority"],
        seeds::program = wormhole_post_message_shim::ID,
        bump
    )]
    /// CHECK: Shim event authority
    pub wormhole_post_message_shim_ea: UncheckedAccount<'info>,

    wormhole_post_message_shim: Program<'info, WormholePostMessageShim>,
}

impl RelayMessage<'_> {
    pub fn handler(ctx: Context<Self>, message: Vec<u8>) -> Result<()> {
        let bridge_fee = parse_bridge_fee(&ctx.accounts.bridge.try_borrow_data()?);

        if bridge_fee > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.fee_collector.to_account_info(),
                    },
                ),
                bridge_fee,
            )?;
        }

        wormhole_post_message_shim::cpi::post_message(
            CpiContext::new_with_signer(
                ctx.accounts.wormhole_post_message_shim.to_account_info(),
                wormhole_post_message_shim::cpi::accounts::PostMessage {
                    payer: ctx.accounts.payer.to_account_info(),
                    bridge: ctx.accounts.bridge.to_account_info(),
                    message: ctx.accounts.message.to_account_info(),
                    emitter: ctx.accounts.emitter.to_account_info(),
                    sequence: ctx.accounts.sequence.to_account_info(),
                    fee_collector: ctx.accounts.fee_collector.to_account_info(),
                    clock: ctx.accounts.clock.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
                    program: ctx.accounts.wormhole_post_message_shim.to_account_info(),
                    event_authority: ctx.accounts.wormhole_post_message_shim_ea.to_account_info(),
                },
                &[&[b"emitter", &[ctx.bumps.emitter]]],
            ),
            0,
            Finality::Finalized,
            message,
        )?;

        Ok(())
    }
}

fn parse_bridge_fee(bridge_data: &[u8]) -> u64 {
    let fee_offset = 24;
    let fee_bytes = &bridge_data[fee_offset..fee_offset + 8];
    u64::from_le_bytes(fee_bytes.try_into().unwrap_or_default())
}
