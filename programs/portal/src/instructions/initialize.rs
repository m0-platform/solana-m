use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface};
use executor_account_resolver_svm::{
    RESOLVER_RESULT_ACCOUNT_INIT_SIZE, RESOLVER_RESULT_ACCOUNT_SEED,
};

use crate::{
    bitmap::Bitmap,
    config::{Config, RemainingAccount},
    error::NTTError,
    instructions::ExecutorAccountResolverResult,
    ntt_messages::{BpfLoaderUpgradeable, ChainId, Mode},
    queue::{outbox::OutboxRateLimit, rate_limit::RateLimitState},
};

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
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
        space = 8 + Config::INIT_SPACE,
        payer = payer,
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        constraint = mint.mint_authority.unwrap() == token_authority.key() @ NTTError::InvalidMintAuthority
    )]
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
    pub evm_token: [u8; 32],
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    ctx.accounts.config.set_inner(crate::config::Config {
        bump: ctx.bumps.config,
        mint: ctx.accounts.mint.key(),
        token_program: ctx.accounts.token_program.key(),
        mode: args.mode,
        chain_id: ChainId { id: args.chain_id },
        owner: ctx.accounts.deployer.key(),
        pending_owner: None,
        paused: false,
        next_transceiver_id: 0,
        // NOTE: can be changed via `set_threshold` ix
        threshold: 1,
        enabled_transceivers: Bitmap::new(),
        custody: ctx.accounts.custody.key(),
        release_inbound_remaining_accounts: [
            RemainingAccount::new(earn::ID, false),
            RemainingAccount::new(
                Pubkey::find_program_address(&[earn::state::GLOBAL_SEED], &earn::ID).0,
                true,
            ),
        ],
        evm_token: args.evm_token,
        resolve_lut: Pubkey::default(),
    });

    ctx.accounts.rate_limit.set_inner(OutboxRateLimit {
        rate_limit: RateLimitState::new(args.limit),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeResolverAccounts<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + RESOLVER_RESULT_ACCOUNT_INIT_SIZE,
        seeds = [RESOLVER_RESULT_ACCOUNT_SEED],
        bump
    )]
    pub result_account: Account<'info, ExecutorAccountResolverResult>,

    system_program: Program<'info, System>,
}

pub fn initialize_resolver_accounts(
    ctx: Context<InitializeResolverAccounts>,
    additional_lut: Option<Pubkey>,
) -> Result<()> {
    ctx.accounts.config.resolve_lut = additional_lut.unwrap_or_default();

    Ok(())
}
