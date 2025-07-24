use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{
        self,
        instructions::{load_current_index_checked, load_instruction_at_checked},
    },
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    errors::EarnError,
    instruction::CloseTokenAccount,
    state::{EarnGlobal, GLOBAL_SEED},
    utils::token::thaw_token_account,
};

#[derive(Accounts)]
pub struct RequestTokenAccount<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        has_one = m_mint @ EarnError::InvalidAccount,
    )]
    pub global: Account<'info, EarnGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        associated_token::mint = m_mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,

    /// CHECK: address on account checked
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
}

impl RequestTokenAccount<'_> {
    fn validate(&self) -> Result<()> {
        check_for_close(&self.instruction_sysvar_account, &self.token_account)
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        thaw_token_account(
            &ctx.accounts.token_account,
            &ctx.accounts.m_mint,
            &ctx.accounts.global.to_account_info(),
            &[&[GLOBAL_SEED, &[ctx.accounts.global.bump]]],
            &ctx.accounts.token_program,
        )?;

        Ok(())
    }
}

pub fn check_for_close(
    instruction_sysvar_account_info: &AccountInfo,
    token_account: &InterfaceAccount<TokenAccount>,
) -> Result<()> {
    let ixs_info = instruction_sysvar_account_info;
    let mut index = load_current_index_checked(ixs_info)? as usize + 1;

    loop {
        match load_instruction_at_checked(index, ixs_info) {
            Ok(ix) => {
                if ix.program_id == crate::id() {
                    let ix_discriminator: [u8; 8] = ix.data[0..8]
                        .try_into()
                        .map_err(|_| EarnError::InvalidInstructionError)?;

                    // Check if the instruction is a CloseTokenAccount instruction
                    if ix_discriminator == CloseTokenAccount::DISCRIMINATOR {
                        // Check that it has the same token account
                        ix.accounts
                            .iter()
                            .find(|account| account.pubkey.eq(&token_account.key()))
                            .ok_or(EarnError::InvalidAccount)?;

                        return Ok(());
                    }
                }
            }
            Err(_) => return err!(EarnError::MissingCloseInstructionError),
        }

        index += 1;
    }
}
