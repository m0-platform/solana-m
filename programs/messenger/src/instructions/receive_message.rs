use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use common::{IndexPayload, Payload};

use crate::{
    instructions::earn::{
        self, accounts::EarnGlobal, cpi::accounts::PropagateIndex, program::Earn,
    },
    state::{AUTHORITY_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct ReceiveMessage<'info> {
    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: account does not hold data
    pub messenger_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = earn::ID,
        bump = m_global.bump,
        has_one = m_mint,
    )]
    pub m_global: Account<'info, EarnGlobal>,

    #[account(mut)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    pub earn_program: Program<'info, Earn>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl ReceiveMessage<'_> {
    pub fn handler(ctx: Context<Self>, payload: Vec<u8>) -> Result<()> {
        let message = Payload::decode(payload);

        match message {
            Payload::TokenTransfer(_token_transfer) => {
                msg!("Received Token Transfer Payload");
            }
            Payload::Index(index_payload) => {
                msg!("Received Index Payload: {}", index_payload.index);
                return Self::handle_index_payload(ctx, index_payload);
            }
            Payload::FillReport(_fill_report) => {
                msg!("Received Fill Report Payload:");
            }
        }

        Ok(())
    }

    fn handle_index_payload(ctx: Context<Self>, payload: IndexPayload) -> Result<()> {
        let authority_seed: &[&[&[u8]]] = &[&[AUTHORITY_SEED, &[ctx.bumps.messenger_authority]]];

        let propogate_ctx = CpiContext::new_with_signer(
            ctx.accounts.earn_program.to_account_info(),
            PropagateIndex {
                signer: ctx.accounts.messenger_authority.to_account_info(),
                global_account: ctx.accounts.m_global.to_account_info(),
                m_mint: ctx.accounts.m_mint.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            authority_seed,
        );

        earn::cpi::propagate_index(propogate_ctx, payload.index, [0; 32])?;

        Ok(())
    }
}
