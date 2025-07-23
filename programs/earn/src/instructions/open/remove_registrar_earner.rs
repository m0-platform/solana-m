// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::state::AccountState,
    token_interface::{Mint, Token2022, TokenAccount},
};

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnGlobal, ESCROW_SEED_PREFIX, GLOBAL_SEED},
    utils::{
        merkle_proof::{verify_not_in_tree, ProofElement},
        token::freeze_token_account,
    },
};

declare_program!(ext_swap);
use ext_swap::{accounts::SwapGlobal, program::ExtSwap};

declare_program!(wm_ext);
use wm_ext::{accounts::ExtGlobalV2, program::MExt};

#[derive(Accounts)]
pub struct RemoveRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global_account: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    /// We originally allowed this account to be validated later and potentially be closed,
    /// but this is not necessary anymore since if the account is closed, it will be frozen
    /// when re-initialized. Therefore, closing a token account is equivalent to removing an earner.
    /// For this reason, we also know that if there is a thawed token account, it went through the
    /// add registrar earner flow and thus the owner is the original since we required it to be immutable.
    #[account(
        mut,
        token::mint = global_account.m_mint,
        constraint = user_token_account.state == AccountState::Initialized @ EarnError::InvalidAccount,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,

    pub ext_swap_program: Option<Program<'info, ExtSwap>>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = ext_swap_program.as_ref().unwrap().key(),
        bump = ext_swap_global.bump,
    )]
    pub ext_swap_global: Option<Account<'info, SwapGlobal>>,

    #[account(mut, address = global_account.wm_mint)]
    pub wm_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds = [ESCROW_SEED_PREFIX, user_token_account.key().as_ref()],
        bump,
        token::mint = wm_mint,
        token::authority = global_account,
        token::token_program = token_program,
    )]
    pub wm_escrow: Option<InterfaceAccount<'info, TokenAccount>>,

    pub wm_ext_program: Option<Program<'info, MExt>>,

    /// CHECK: This is validated in the CPI call to ext_swap
    pub wm_mint_authority: Option<UncheckedAccount<'info>>,

    /// CHECK: This is validated in the CPI call to ext_swap
    pub wm_vault_authority: Option<UncheckedAccount<'info>>,

    #[account(mut)]
    pub wm_vault: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub wm_ext_global: Option<Account<'info, ExtGlobalV2>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub system_program: Option<Program<'info, System>>,
}

impl RemoveRegistrarEarner<'_> {
    fn validate(&self, proofs: Vec<Vec<ProofElement>>, neighbors: Vec<[u8; 32]>) -> Result<()> {
        // Verify the user is not in the approved earners list
        verify_not_in_tree(
            self.global_account.earner_merkle_root,
            self.user_token_account.owner.to_bytes(),
            proofs,
            neighbors,
        )?;

        Ok(())
    }

    #[access_control(ctx.accounts.validate(proofs, neighbors))]
    pub fn handler(
        ctx: Context<RemoveRegistrarEarner>,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        // Check if the token account has a non-zero balance
        // If so, migrate the existing balance to wM in an escrow token account to be claimed later by the owner
        // We have to do this forced migration in order to make this removal step permissionless and solely based on the earner list.
        // Additionally, we cannot leave a non-zero balance in the frozen M token account since it would continue to
        // earn yield.
        if ctx.accounts.user_token_account.amount > 0 {
            // Verify optional accounts are present
            let ext_swap_program = ctx
                .accounts
                .ext_swap_program
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let ext_swap_global = ctx
                .accounts
                .ext_swap_global
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_mint = ctx
                .accounts
                .wm_mint
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_ext_program = ctx
                .accounts
                .wm_ext_program
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_ext_global = ctx
                .accounts
                .wm_ext_global
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_escrow = ctx
                .accounts
                .wm_escrow
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_mint_authority = ctx
                .accounts
                .wm_mint_authority
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_vault_authority = ctx
                .accounts
                .wm_vault_authority
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let wm_vault = ctx
                .accounts
                .wm_vault
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let associated_token_program = ctx
                .accounts
                .associated_token_program
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();
            let system_program = ctx
                .accounts
                .system_program
                .as_ref()
                .ok_or(EarnError::RequiredAccountMissing)?
                .to_account_info();

            // The amount passed is the user's principal balance
            // The global account is the signer here since it is the permanent delegate on the M mint
            // We use the ext_swap program instead of the ext_earn program for wM directly to avoid needing permission
            ext_swap::cpi::wrap(
                CpiContext::new_with_signer(
                    ext_swap_program,
                    ext_swap::cpi::accounts::Wrap {
                        signer: ctx.accounts.global_account.to_account_info(),
                        wrap_authority: None,
                        swap_global: ext_swap_global,
                        to_global: wm_ext_global,
                        m_global: ctx.accounts.global_account.to_account_info(),
                        to_mint: wm_mint,
                        m_mint: ctx.accounts.m_mint.to_account_info(),
                        m_token_account: ctx.accounts.user_token_account.to_account_info(),
                        to_token_account: wm_escrow,
                        to_m_vault_auth: wm_vault_authority,
                        to_mint_authority: wm_mint_authority,
                        to_m_vault: wm_vault,
                        to_token_program: ctx.accounts.token_program.to_account_info(),
                        m_token_program: ctx.accounts.token_program.to_account_info(),
                        to_ext_program: wm_ext_program,
                        associated_token_program,
                        system_program,
                    },
                    &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
                ),
                ctx.accounts.user_token_account.amount,
            )?;
        }

        // Freeze the user's token account so they can no longer hold $M
        freeze_token_account(
            &ctx.accounts.user_token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global_account.to_account_info(),
            &[&[GLOBAL_SEED, &[ctx.accounts.global_account.bump]]],
            &ctx.accounts.token_program,
        )?;

        Ok(())
    }
}
