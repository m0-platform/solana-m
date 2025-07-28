use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use earn::state::{EarnGlobal, GLOBAL_SEED};
use ext_swap::{accounts::SwapGlobal, program::ExtSwap};

use crate::{
    TransferBurnBumps, __client_accounts_transfer_burn, __cpi_client_accounts_transfer_burn,
    instructions::{ext_swap, transfer_burn, TransferArgs, TransferBurn},
    ntt_messages::ChainId,
};

#[derive(Accounts)]
pub struct TransferExtensionBurn<'info> {
    pub common: TransferBurn<'info>,

    #[account(mut)]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap::ID,
        bump = swap_global.bump,
    )]
    pub swap_global: Box<Account<'info, SwapGlobal>>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = earn::ID,
        bump = m_global.bump,
    )]
    pub m_global: Box<Account<'info, EarnGlobal>>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: unwrap CPI will validate the account
    pub ext_global: AccountInfo<'info>,

    #[account(mut)]
    pub ext_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = common.common.mint,
        associated_token::authority = ext_m_vault_auth,
        associated_token::token_program = common.common.token_program,
    )]
    pub ext_m_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [b"m_vault"],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_m_vault_auth: AccountInfo<'info>,

    #[account(
        seeds = [b"mint_authority"],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: account does not hold data
    pub ext_mint_authority: AccountInfo<'info>,

    /// CHECK: checked against whitelisted extensions
    pub ext_program: AccountInfo<'info>,

    pub swap_program: Program<'info, ExtSwap>,

    pub ext_token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn transfer_extension_burn<'info>(
    ctx: Context<'_, '_, '_, 'info, TransferExtensionBurn<'info>>,
    ext_principal: u64,
    recipient_chain: ChainId,
    recipient_address: [u8; 32],
    destination_token: [u8; 32],
    should_queue: bool,
) -> Result<()> {
    let m_pre_balance = ctx.accounts.common.common.from.amount;
    let token_auth_bump = ctx.bumps.common.token_authority;

    // Unwrap extension tokens to $M
    ext_swap::cpi::unwrap(
        CpiContext::new_with_signer(
            ctx.accounts.swap_program.to_account_info(),
            ext_swap::cpi::accounts::Unwrap {
                signer: ctx.accounts.common.common.payer.to_account_info(),
                unwrap_authority: Some(ctx.accounts.common.token_authority.to_account_info()),
                swap_global: ctx.accounts.swap_global.to_account_info(),
                from_global: ctx.accounts.ext_global.to_account_info(),
                from_mint: ctx.accounts.ext_mint.to_account_info(),
                m_mint: ctx.accounts.common.common.mint.to_account_info(),
                m_token_account: ctx.accounts.common.common.from.to_account_info(),
                from_token_account: ctx.accounts.ext_token_account.to_account_info(),
                from_m_vault_auth: ctx.accounts.ext_m_vault_auth.to_account_info(),
                from_mint_authority: ctx.accounts.ext_mint_authority.to_account_info(),
                from_m_vault: ctx.accounts.ext_m_vault.to_account_info(),
                from_token_program: ctx.accounts.ext_token_program.to_account_info(),
                m_token_program: ctx.accounts.common.common.token_program.to_account_info(),
                from_ext_program: ctx.accounts.ext_program.to_account_info(),
                associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                system_program: ctx.accounts.common.common.system_program.to_account_info(),
            },
            &[&[crate::TOKEN_AUTHORITY_SEED, &[token_auth_bump]]],
        ),
        ext_principal,
    )?;

    // Amount of $M we got from unwrap
    ctx.accounts.common.common.from.reload()?;
    let m_amount = ctx.accounts.common.common.from.amount - m_pre_balance;

    let sub_ctx: Context<'_, '_, '_, 'info, TransferBurn<'info>> = Context::new(
        ctx.program_id,
        &mut ctx.accounts.common,
        ctx.remaining_accounts,
        TransferBurnBumps {
            common: ctx.bumps.common.common,
            token_authority: ctx.bumps.common.token_authority,
        },
    );

    // TransferBurn $M from unwrap
    transfer_burn(
        sub_ctx,
        TransferArgs {
            amount: m_amount,
            recipient_chain: recipient_chain,
            recipient_address: recipient_address,
            should_queue: should_queue,
        },
    )?;

    // Overwrite default destination token
    ctx.accounts.common.common.outbox_item.destination_token = destination_token;

    Ok(())
}
