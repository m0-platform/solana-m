// ext_earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

// local dependencies
use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED, MINT_AUTHORITY_SEED, M_VAULT_SEED},
};
use earn::{
    state::{Global as EarnGlobal, GLOBAL_SEED as EARN_GLOBAL_SEED},
    ID as EARN_PROGRAM,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ExtGlobal::size(0),
        seeds = [EXT_GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        mint::token_program = token_2022,
        address = m_earn_global_account.mint,
    )]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mint::token_program = token_2022,
        mint::decimals = m_mint.decimals,
        constraint = ext_mint.supply == 0 @ ExtError::InvalidMint,
    )]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [EARN_GLOBAL_SEED],
        seeds::program = EARN_PROGRAM,
        bump = m_earn_global_account.bump,
    )]
    pub m_earn_global_account: Account<'info, EarnGlobal>,

    pub token_2022: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, earn_authority: Pubkey) -> Result<()> {
    let m_vault_bump = Pubkey::find_program_address(&[M_VAULT_SEED], ctx.program_id).1;
    let (ext_mint_authority, ext_mint_authority_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id);

    if ctx.accounts.ext_mint.mint_authority.unwrap_or_default() != ext_mint_authority {
        return err!(ExtError::InvalidMint);
    }

    ctx.accounts.global_account.set_inner(ExtGlobal {
        admin: ctx.accounts.admin.key(),
        earn_authority,
        ext_mint: ctx.accounts.ext_mint.key(),
        m_mint: ctx.accounts.m_mint.key(),
        m_earn_global_account: ctx.accounts.m_earn_global_account.key(),
        index: ctx.accounts.m_earn_global_account.index,
        timestamp: ctx.accounts.m_earn_global_account.timestamp,
        bump: ctx.bumps.global_account,
        m_vault_bump,
        ext_mint_authority_bump,
        wrap_authorities: vec![],
    });

    Ok(())
}
