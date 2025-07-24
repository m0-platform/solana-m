use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface};

use crate::{
    bitmap::Bitmap,
    config::{Config, RemainingAccount},
    error::NTTError,
    ntt_messages::{BpfLoaderUpgradeable, ChainId, Mode},
    queue::{outbox::OutboxRateLimit, rate_limit::RateLimitState},
    spl_multisig::SplMultisig,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = program_data.upgrade_authority_address.unwrap_or_default())]
    pub deployer: Signer<'info>,

    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable_program,
    )]
    program_data: Account<'info, ProgramData>,

    #[account(
        init,
        space = 8 + crate::config::Config::INIT_SPACE,
        payer = payer,
        seeds = [crate::config::Config::SEED_PREFIX],
        bump
    )]
    pub config: Box<Account<'info, crate::config::Config>>,

    // NOTE: this account is unconstrained and is the responsibility of the
    // handler to constrain it
    pub mint: Box<InterfaceAccount<'info, token_interface::Mint>>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutboxRateLimit::INIT_SPACE,
        seeds = [OutboxRateLimit::SEED_PREFIX],
        bump,
    )]
    pub rate_limit: Account<'info, OutboxRateLimit>,

    #[account(
        seeds = [crate::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: [`token_authority`] is checked against the custody account and the [`mint`]'s mint_authority
    /// In any case, this function is used to set the Config and initialize the program so we
    /// assume the caller of this function will have total control over the program.
    ///
    /// TODO: Using `UncheckedAccount` here leads to "Access violation in stack frame ...".
    /// Could refactor code to use `Box<_>` to reduce stack size.
    pub token_authority: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = token_authority,
        associated_token::token_program = token_program,
    )]
    /// The custody account that holds tokens in locking mode and temporarily
    /// holds tokens in burning mode.
    /// CHECK: Use init_if_needed here to prevent a denial-of-service of the [`initialize`]
    /// function if the token account has already been created.
    pub custody: InterfaceAccount<'info, token_interface::TokenAccount>,

    /// CHECK: checked to be the appropriate token program when initialising the
    /// associated token account for the given mint.
    pub token_program: Interface<'info, token_interface::TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    bpf_loader_upgradeable_program: Program<'info, BpfLoaderUpgradeable>,

    system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub chain_id: u16,
    pub limit: u64,
    pub mode: Mode,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct InitializeMultisig<'info> {
    #[account(
        constraint =
            args.mode == Mode::Locking
            || common.mint.mint_authority.unwrap() == multisig.key()
            @ NTTError::InvalidMintAuthority,
    )]
    pub common: Initialize<'info>,

    #[account(
        constraint =
            multisig.m == 1 && multisig.signers.contains(&common.token_authority.key())
            @ NTTError::InvalidMultisig,
    )]
    pub multisig: InterfaceAccount<'info, SplMultisig>,
}

pub fn initialize_multisig(ctx: Context<InitializeMultisig>, args: InitializeArgs) -> Result<()> {
    let common = &mut ctx.accounts.common;

    common.config.set_inner(crate::config::Config {
        bump: ctx.bumps.common.config,
        mint: common.mint.key(),
        token_program: common.token_program.key(),
        mode: args.mode,
        chain_id: ChainId { id: args.chain_id },
        owner: common.deployer.key(),
        pending_owner: None,
        paused: false,
        next_transceiver_id: 0,
        // NOTE: can't be changed for now
        threshold: 1,
        enabled_transceivers: Bitmap::new(),
        custody: common.custody.key(),
        release_inbound_remaining_accounts: [
            RemainingAccount::new(earn::ID, false),
            RemainingAccount::new(
                Pubkey::find_program_address(&[earn::state::GLOBAL_SEED], &earn::ID).0,
                true,
            ),
        ],
        evm_token: [0; 32],
        evm_wrapped_token: [0; 32],
    });

    common.rate_limit.set_inner(OutboxRateLimit {
        rate_limit: RateLimitState::new(args.limit),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SetDestinationAddresses<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    pub config: Box<Account<'info, Config>>,
}

pub fn set_destination_addresses(
    ctx: Context<SetDestinationAddresses>,
    evm_token: [u8; 32],
    evm_wrapped_token: [u8; 32],
) -> Result<()> {
    ctx.accounts.config.evm_token = evm_token;
    ctx.accounts.config.evm_wrapped_token = evm_wrapped_token;

    Ok(())
}
