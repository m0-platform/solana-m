use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use common::{Payload, TokenTransferPayload};

use crate::{
    errors::MessengerError,
    instructions::{
        ext_swap::{self, accounts::SwapGlobal, program::ExtSwap},
        send_message, wormhole_adapter,
    },
    state::{MessengerGlobal, AUTHORITY_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SendTokens<'info> {
    pub sender: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = messenger_global.bump,
    )]
    pub messenger_global: Account<'info, MessengerGlobal>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap::ID,
        bump = swap_global.bump,
    )]
    pub swap_global: Account<'info, SwapGlobal>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = extension_program.key(),
        bump,
    )]
    /// CHECK: account checked on uwrap CPI
    pub extension_global: AccountInfo<'info>,

    #[account(
        mut,
        mint::token_program = m_token_program
    )]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub extension_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = messenger_authority,
        associated_token::token_program = m_token_program,
    )]
    pub m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub extension_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: account does not hold data
    pub messenger_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = ext_m_vault_auth,
        associated_token::token_program = m_token_program,
    )]
    pub ext_m_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"m_vault"],
        seeds::program = extension_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_m_vault_auth: AccountInfo<'info>,

    #[account(
        seeds = [b"mint_authority"],
        seeds::program = extension_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_mint_authority: AccountInfo<'info>,

    pub swap_program: Program<'info, ExtSwap>,

    /// CHECK: account checked on uwrap CPI
    pub extension_program: AccountInfo<'info>,

    pub m_token_program: Interface<'info, TokenInterface>,

    pub extension_token_program: Interface<'info, TokenInterface>,

    #[account(address = wormhole_adapter::ID)]
    /// CHECK: checked against constraint
    pub bridge_adapter: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl SendTokens<'_> {
    fn validate(&self, amount: u64) -> Result<()> {
        if self.messenger_global.paused {
            return err!(MessengerError::Paused);
        }

        if self
            .swap_global
            .whitelisted_extensions
            .iter()
            .find(|ext| {
                ext.program_id == self.extension_program.key()
                    && ext.mint == self.extension_mint.key()
            })
            .is_none()
        {
            return err!(MessengerError::InvalidExtension);
        }

        if amount == 0 {
            return err!(MessengerError::InvalidAmount);
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(amount))]
    pub fn handler<'info>(
        ctx: Context<'_, '_, '_, 'info, SendTokens<'info>>,
        amount: u64,
        destination_token: [u8; 32],
        recipient: [u8; 32],
    ) -> Result<()> {
        let m_pre_balance = ctx.accounts.m_token_account.amount;

        // Unwrap extension tokens to $M
        ext_swap::cpi::unwrap(
            CpiContext::new_with_signer(
                ctx.accounts.swap_program.to_account_info(),
                ext_swap::cpi::accounts::Unwrap {
                    signer: ctx.accounts.sender.to_account_info(),
                    unwrap_authority: Some(ctx.accounts.messenger_authority.to_account_info()),
                    swap_global: ctx.accounts.swap_global.to_account_info(),
                    from_global: ctx.accounts.extension_global.to_account_info(),
                    from_mint: ctx.accounts.extension_mint.to_account_info(),
                    m_mint: ctx.accounts.m_mint.to_account_info(),
                    m_token_account: ctx.accounts.m_token_account.to_account_info(),
                    from_token_account: ctx.accounts.extension_token_account.to_account_info(),
                    from_m_vault_auth: ctx.accounts.ext_m_vault_auth.to_account_info(),
                    from_mint_authority: ctx.accounts.ext_mint_authority.to_account_info(),
                    from_m_vault: ctx.accounts.ext_m_vault.to_account_info(),
                    from_token_program: ctx.accounts.extension_token_program.to_account_info(),
                    m_token_program: ctx.accounts.m_token_program.to_account_info(),
                    from_ext_program: ctx.accounts.extension_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                &[&[AUTHORITY_SEED, &[ctx.bumps.messenger_authority]]],
            ),
            amount,
        )?;

        // Amount of $M we got from unwrap
        ctx.accounts.m_token_account.reload()?;
        let m_amount = ctx.accounts.m_token_account.amount - m_pre_balance;

        let message = Payload::TokenTransfer(TokenTransferPayload {
            amount: m_amount as u128,
            destination_token,
            sender: ctx.accounts.sender.key().to_bytes(),
            recipient,
            index: 0,
        });

        // Send message to bridge adapter
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
