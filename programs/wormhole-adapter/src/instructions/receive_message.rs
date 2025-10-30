use anchor_lang::{prelude::*, solana_program::keccak};
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::{
    consts::CORE_BRIDGE_PROGRAM_ID,
    instructions::{
        earn::{self, accounts::EarnGlobal, program::Earn},
        messenger::{self},
        wormhole_verify_vaa_shim::{
            self, cpi::accounts::VerifyHash, program::WormholeVerifyVaaShim,
        },
        VaaBody,
    },
    state::{WormholeGlobal, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct ReceiveMessage<'info> {
    #[account(
        constraint = !wormhole_global.paused,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub wormhole_global: Account<'info, WormholeGlobal>,

    #[account(
        seeds = [b"authority"], 
        seeds::program = messenger::ID,
        bump
    )]
    pub messenger_authority: AccountInfo<'info>,

    /// CHECK: Guardian set used for signature verification by shim (checked by the shim)
    pub guardian_set: UncheckedAccount<'info>,

    /// CHECK: Stored guardian signatures to be verified by shim (ownership ownership and discriminator is checked by the shim)
    pub guardian_signatures: UncheckedAccount<'info>,

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

    pub wormhole_verify_vaa_shim: Program<'info, WormholeVerifyVaaShim>,

    pub earn_program: Program<'info, Earn>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl ReceiveMessage<'_> {
    fn validate(&self, guardian_set_index: u32, vaa_body: &Vec<u8>) -> Result<()> {
        let (guardian_set_key, guardian_set_bump) = Pubkey::find_program_address(
            &[b"GuardianSet", &guardian_set_index.to_be_bytes()],
            &CORE_BRIDGE_PROGRAM_ID,
        );

        if guardian_set_key != self.guardian_set.key() {
            return Err(ProgramError::InvalidArgument.into());
        }

        // Compute the message hash.
        let message_hash = &keccak::hashv(&[&vaa_body]).to_bytes();
        let digest = keccak::hash(message_hash.as_slice()).to_bytes();

        // Verify the hash against the signatures.
        wormhole_verify_vaa_shim::cpi::verify_hash(
            CpiContext::new(
                self.wormhole_verify_vaa_shim.to_account_info(),
                VerifyHash {
                    guardian_set: self.guardian_set.to_account_info(),
                    guardian_signatures: self.guardian_signatures.to_account_info(),
                },
            ),
            guardian_set_bump,
            digest,
        )?;

        // Parse and verify vaa
        let vaa = VaaBody::from_bytes(vaa_body)?;
        self.wormhole_global.validate(&vaa)?;

        Ok(())
    }

    #[access_control(ctx.accounts.validate(guardian_set_index, &vaa_body))]
    pub fn handler(ctx: Context<Self>, guardian_set_index: u32, vaa_body: Vec<u8>) -> Result<()> {
        let vaa = VaaBody::from_bytes(&vaa_body)?;

        messenger::cpi::receive_message(
            CpiContext::new(
                ctx.accounts.wormhole_verify_vaa_shim.to_account_info(),
                messenger::cpi::accounts::ReceiveMessage {
                    messenger_authority: ctx.accounts.messenger_authority.to_account_info(),
                    m_global: ctx.accounts.m_global.to_account_info(),
                    m_mint: ctx.accounts.m_mint.to_account_info(),
                    earn_program: ctx.accounts.earn_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            ),
            vaa.payload.encode(),
        )?;

        Ok(())
    }
}
