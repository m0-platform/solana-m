// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::state::AccountState,
    token_2022_extensions::spl_pod::optional_keys::OptionalNonZeroPubkey,
    token_interface::{Mint, Token2022, TokenAccount},
};
use spl_token_2022::extension::{
    default_account_state::DefaultAccountState, // permanent_delegate::PermanentDelegate,
    scaled_ui_amount::ScaledUiAmountConfig,
    BaseStateWithExtensions,
    ExtensionType,
    StateWithExtensions,
};

// local dependencies
use crate::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, PORTAL_PROGRAM},
    errors::EarnError,
    state::{EarnGlobal, GLOBAL_SEED, TOKEN_AUTHORITY_SEED},
    utils::{conversion::update_multiplier, token::thaw_token_account},
};

declare_program!(old_earn);
use old_earn::{accounts::Global as OldGlobal, ID as OLD_EARN_PROGRAM_ID};

declare_program!(ext_swap);
use ext_swap::{constants::GLOBAL_SEED as SWAP_GLOBAL_SEED, ID as EXT_SWAP_PROGRAM_ID};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + EarnGlobal::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, EarnGlobal>,

    #[account(
        seeds = [GLOBAL_SEED],
        seeds::program = OLD_EARN_PROGRAM_ID,
        bump,
    )]
    pub old_global_account: AccountInfo<'info>,

    #[account(mint::token_program = token_program)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: This account is validated by its seeds
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        seeds::program = PORTAL_PROGRAM,
        bump,
    )]
    pub portal_token_authority: UncheckedAccount<'info>,

    /// CHECK: This account is validated by its seeds
    #[account(
        seeds = [SWAP_GLOBAL_SEED],
        seeds::program = EXT_SWAP_PROGRAM_ID,
        bump,
    )]
    pub ext_swap_global: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = m_mint,
        associated_token::authority = portal_token_authority,
        associated_token::token_program = token_program,
    )]
    pub portal_m_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = m_mint,
        associated_token::authority = ext_swap_global,
        associated_token::token_program = token_program,
    )]
    pub ext_swap_m_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl Initialize<'_> {
    fn validate(&self, current_index: Option<u64>) -> Result<()> {
        // Must specify the current index if the old global account is empty
        if self.old_global_account.data_is_empty() && current_index.is_none() {
            return err!(EarnError::InvalidParam);
        }

        // Get the mint account data once and reuse it
        let account_info = self.m_mint.to_account_info();
        let mint_data = account_info.try_borrow_data()?;
        let mint_ext_data = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;

        // Validate the m_mint has the correct extensions and that the global account has been given the appropriate permissions
        let extensions = mint_ext_data.get_extension_types()?;
        let global_key = &self.global_account.key();

        // 1. Must have the ScaledUiAmount extension and global account must be the authority
        if !extensions.contains(&ExtensionType::ScaledUiAmount) {
            return err!(EarnError::InvalidMint);
        }

        let scaled_ui_config = mint_ext_data.get_extension::<ScaledUiAmountConfig>()?;
        if scaled_ui_config.authority != OptionalNonZeroPubkey(*global_key) {
            return err!(EarnError::InvalidMint);
        }

        // 2. Must have the Default Account State extension
        // and the global account as the freeze authority
        if !extensions.contains(&ExtensionType::DefaultAccountState) {
            return err!(EarnError::InvalidMint);
        }
        let default_account_state_config = mint_ext_data.get_extension::<DefaultAccountState>()?;
        if AccountState::try_from(default_account_state_config.state)
            .or(err!(EarnError::TypeConversionError))?
            != AccountState::Frozen
        {
            // TODO could also just update it, but this is more explicit
            return err!(EarnError::InvalidMint);
        }

        if self.m_mint.freeze_authority.is_none()
            || self.m_mint.freeze_authority.unwrap() != *global_key
        {
            return err!(EarnError::InvalidMint);
        }

        // // 3. Must have the Permanent Delegate extension
        // // and the global account as the delegate
        // // The reason this is required is to enable forced exits to wM in the event
        // // an earner is removed from the earner list.
        // if !extensions.contains(&ExtensionType::PermanentDelegate) {
        //     return err!(EarnError::InvalidMint);
        // }
        // let permanent_delegate_config = mint_ext_data.get_extension::<PermanentDelegate>()?;
        // if permanent_delegate_config.delegate != OptionalNonZeroPubkey(*global_key) {
        //     return err!(EarnError::InvalidMint);
        // }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(current_index))]
    pub fn handler(ctx: Context<Initialize>, current_index: Option<u64>) -> Result<()> {
        // Portal authority that will propagate indexes and roots
        let portal_authority =
            Pubkey::find_program_address(&[TOKEN_AUTHORITY_SEED], &PORTAL_PROGRAM).0;

        // Set global state
        ctx.accounts.global_account.set_inner(EarnGlobal {
            admin: ctx.accounts.admin.key(),
            m_mint: ctx.accounts.m_mint.key(),
            portal_authority,
            earner_merkle_root: [0; 32],
            bump: ctx.bumps.global_account,
        });

        // Migrate the old global account data if it exists
        if !ctx.accounts.old_global_account.data_is_empty() {
            // Deserialize the old global account data
            let data_ref = ctx.accounts.old_global_account.data.borrow();
            let mut data_slice = data_ref.as_ref();
            let old_global = OldGlobal::deserialize(&mut data_slice)?;

            // Set existing merkle root
            ctx.accounts.global_account.earner_merkle_root = old_global.earner_merkle_root;

            // Set the multiplier on the m_mint to the current index and timestamp on the old earn program
            update_multiplier(
                &mut ctx.accounts.m_mint,                       // mint
                &ctx.accounts.global_account.to_account_info(), // authority
                &[&[GLOBAL_SEED, &[ctx.bumps.global_account]]], // authority seeds
                &ctx.accounts.token_program,                    // token program
                old_global.index,                               // index
                old_global.timestamp as i64,                    // timestamp
            )?;
        } else {
            update_multiplier(
                &mut ctx.accounts.m_mint,                       // mint
                &ctx.accounts.global_account.to_account_info(), // authority
                &[&[GLOBAL_SEED, &[ctx.bumps.global_account]]], // authority seeds
                &ctx.accounts.token_program,                    // token program
                current_index.unwrap(),                         // index
                Clock::get()?.unix_timestamp,                   // timestamp
            )?;
        }

        // Thaw the portal and ext swap token accounts so they can be used (if not already thawed)
        if ctx.accounts.portal_m_account.state == AccountState::Frozen {
            thaw_token_account(
                &ctx.accounts.portal_m_account,
                &ctx.accounts.m_mint,
                &ctx.accounts.global_account.to_account_info(),
                &[&[GLOBAL_SEED, &[ctx.bumps.global_account]]],
                &ctx.accounts.token_program,
            )?;
        }
        if ctx.accounts.ext_swap_m_account.state == AccountState::Frozen {
            thaw_token_account(
                &ctx.accounts.ext_swap_m_account,
                &ctx.accounts.m_mint,
                &ctx.accounts.global_account.to_account_info(),
                &[&[GLOBAL_SEED, &[ctx.bumps.global_account]]],
                &ctx.accounts.token_program,
            )?;
        }

        Ok(())
    }
}
