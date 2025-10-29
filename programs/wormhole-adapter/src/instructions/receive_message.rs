declare_program!(wormhole_verify_vaa_shim);

use anchor_lang::{prelude::*, solana_program::keccak};
use wormhole_verify_vaa_shim::cpi::accounts::VerifyHash;
use wormhole_verify_vaa_shim::program::WormholeVerifyVaaShim;

use crate::{
    consts::CORE_BRIDGE_PROGRAM_ID,
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

    /// CHECK: Guardian set used for signature verification by shim (checked by the shim)
    guardian_set: UncheckedAccount<'info>,

    /// CHECK: Stored guardian signatures to be verified by shim (ownership ownership and discriminator is checked by the shim)
    guardian_signatures: UncheckedAccount<'info>,

    wormhole_verify_vaa_shim: Program<'info, WormholeVerifyVaaShim>,
}

impl ReceiveMessage<'_> {
    fn validate(&self, guardian_set_index: u32, vaa_body: Vec<u8>) -> Result<()> {
        if vaa_body.len() < 51 {
            return Err(ProgramError::InvalidArgument.into());
        }

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
        )
    }

    #[access_control(ctx.accounts.validate(guardian_set_index, vaa_body))]
    pub fn handler(ctx: Context<Self>, guardian_set_index: u32, vaa_body: Vec<u8>) -> Result<()> {
        Ok(())
    }
}
