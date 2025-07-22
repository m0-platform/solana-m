use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{burn, Burn, Mint, TokenAccount, TokenInterface},
};
use earn::state::Global;
use ext_swap::{
    program::ExtSwap,
    state::{SwapGlobal, GLOBAL_SEED},
};

use crate::{
    bitmap::Bitmap,
    config::*,
    error::NTTError,
    instructions::{BridgeEvent, TransferArgs},
    ntt_messages::TrimmedAmount,
    peer::NttManagerPeer,
    queue::{
        inbox::InboxRateLimit,
        outbox::{OutboxItem, OutboxRateLimit},
    },
    release_amount,
};

#[derive(Accounts)]
#[instruction(args: TransferArgs)]
pub struct TransferExtensionBurn<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // Ensure that there exists at least one enabled transceiver
    #[account(constraint = !config.enabled_transceivers.is_empty() @ NTTError::NoRegisteredTransceivers)]
    pub config: NotPausedConfig<'info>,

    #[account(mut, address = config.mint)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap::ID,
        bump = swap_global.bump,
    )]
    pub swap_global: Account<'info, SwapGlobal>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = earn::ID,
        bump = m_global.bump,
    )]
    pub m_global: Box<Account<'info, Global>>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        seeds::program = ext_program.key(),
        bump,
    )]
    /// CHECK: CPI will validate the account
    pub ext_global: AccountInfo<'info>,

    /// Account the receives M on unwrap before it gets burned
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = m_mint,
        associated_token::authority = signer,
        associated_token::token_program = m_token_program,
    )]
    pub m_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub ext_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = ext_m_vault_auth,
        associated_token::token_program = m_token_program,
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

    #[account(
        seeds = [crate::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: The seeds constraint enforces that this is the correct account.
    pub token_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + OutboxItem::INIT_SPACE,
    )]
    pub outbox_item: Account<'info, OutboxItem>,

    #[account(mut)]
    pub outbox_rate_limit: Account<'info, OutboxRateLimit>,

    #[account(
        mut,
        seeds = [InboxRateLimit::SEED_PREFIX, args.recipient_chain.id.to_be_bytes().as_ref()],
        bump = inbox_rate_limit.bump,
    )]
    pub inbox_rate_limit: Account<'info, InboxRateLimit>,

    #[account(
        seeds = [NttManagerPeer::SEED_PREFIX, args.recipient_chain.id.to_be_bytes().as_ref()],
        bump = peer.bump,
    )]
    pub peer: Account<'info, NttManagerPeer>,

    /// CHECK: checked against whitelisted extensions
    pub ext_program: UncheckedAccount<'info>,

    pub swap_program: Program<'info, ExtSwap>,

    pub ext_token_program: Interface<'info, TokenInterface>,

    pub m_token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

pub fn transfer_extension_burn<'info>(
    ctx: Context<'_, '_, '_, 'info, TransferExtensionBurn<'info>>,
    args: TransferArgs,
) -> Result<()> {
    let accs = ctx.accounts;

    let TransferArgs {
        amount, // amount is denominated in $M
        recipient_chain,
        recipient_address,
        should_queue,
    } = args;

    // Unwrap returns max(amount, amount_available)
    let m_pre_balance = accs.m_token_account.amount;

    // Unwrap extension tokens to $M
    ext_swap::cpi::unwrap(
        CpiContext::new_with_signer(
            accs.swap_program.to_account_info(),
            ext_swap::cpi::accounts::Unwrap {
                signer: accs.signer.to_account_info(),
                unwrap_authority: Some(accs.token_authority.to_account_info()),
                swap_global: accs.swap_global.to_account_info(),
                from_global: accs.ext_global.to_account_info(),
                m_global: accs.m_global.to_account_info(),
                from_mint: accs.ext_mint.to_account_info(),
                m_mint: accs.m_mint.to_account_info(),
                m_token_account: accs.m_token_account.to_account_info(),
                from_token_account: accs.ext_token_account.to_account_info(),
                from_m_vault_auth: accs.ext_m_vault_auth.to_account_info(),
                from_mint_authority: accs.ext_mint_authority.to_account_info(),
                from_m_vault: accs.ext_m_vault.to_account_info(),
                from_token_program: accs.ext_token_program.to_account_info(),
                m_token_program: accs.m_token_program.to_account_info(),
                from_ext_program: accs.ext_program.to_account_info(),
                associated_token_program: accs.associated_token_program.to_account_info(),
                system_program: accs.system_program.to_account_info(),
            },
            &[&[crate::TOKEN_AUTHORITY_SEED, &[ctx.bumps.token_authority]]],
        ),
        amount,
    )?;

    // Reload M balance and get difference
    accs.m_token_account.reload()?;
    let mut m_delta = accs.m_token_account.amount - m_pre_balance;

    let trimmed_amount =
        TrimmedAmount::remove_dust(&mut m_delta, accs.m_mint.decimals, accs.peer.token_decimals)
            .map_err(NTTError::from)?;

    msg!("Requesting {} $M and briding {} $M", amount, m_delta);

    // Burn $M tokens being bridged
    burn(
        CpiContext::new(
            accs.m_token_program.to_account_info(),
            Burn {
                mint: accs.m_mint.to_account_info(),
                from: accs.m_token_account.to_account_info(),
                authority: accs.signer.to_account_info(),
            },
        ),
        m_delta,
    )?;

    // Release, queue, or error
    let release_timestamp = release_amount(
        &mut accs.outbox_rate_limit,
        &mut accs.inbox_rate_limit,
        m_delta,
        should_queue,
    )?;

    // Create outbox item to be released and relayed
    accs.outbox_item.set_inner(OutboxItem {
        amount: trimmed_amount,
        sender: accs.m_token_account.owner,
        recipient_chain,
        recipient_ntt_manager: accs.peer.address,
        recipient_address,
        destination_token: accs.config.evm_token,
        release_timestamp,
        released: Bitmap::new(),
    });

    accs.m_mint.reload()?;

    emit!(BridgeEvent {
        amount: -(m_delta as i64),
        token_supply: accs.m_mint.supply,
        to: recipient_address,
        from: accs.ext_token_account.owner.to_bytes(),
        wormhole_chain_id: recipient_chain.id,
    });

    Ok(())
}
