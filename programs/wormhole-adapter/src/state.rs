use anchor_lang::prelude::*;

use crate::{errors::WormholeError, instructions::VaaBody};

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[account]
pub struct WormholeGlobal {
    pub bump: u8,
    pub admin: Pubkey,
    pub paused: bool,
    pub peers: Vec<Peer>,
}

#[account]
pub struct Peer {
    pub address: [u8; 32],
    pub chain_id: u16,
}

impl WormholeGlobal {
    pub fn size(peers: usize) -> usize {
        8 + // discriminator
        1 + // bump
        32 + // admin
        1 + // paused
        4 + // length of peers
        peers * 34 // each peer
    }

    pub fn validate(&self, vaa: &VaaBody) -> Result<()> {
        if self
            .peers
            .iter()
            .find(|p| p.chain_id == vaa.emitter_chain && p.address == vaa.emitter_address)
            .is_none()
        {
            return err!(WormholeError::InvalidPeer);
        }

        Ok(())
    }
}
