// earn/utils/merkle_proof.rs

use crate::errors::EarnError;
use anchor_lang::{prelude::*, solana_program};

pub const ZERO_BIT: u8 = 0;
pub const ONE_BIT: u8 = 1;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub struct ProofElement {
    pub node: [u8; 32],
    pub on_right: bool,
}

pub fn verify_in_tree(root: [u8; 32], value: [u8; 32], proof: Vec<ProofElement>) -> Result<u64> {
    let leaf = solana_program::keccak::hashv(&[&[ZERO_BIT], value.as_slice()]).to_bytes();

    let mut computed_hash = leaf;
    let mut index: u64 = 0;

    for (i, proof_element) in proof.into_iter().enumerate() {
        if proof_element.on_right {
            // Hash(current computed hash + current element of the proof)
            computed_hash = solana_program::keccak::hashv(&[
                &[ONE_BIT],
                computed_hash.as_slice(),
                proof_element.node.as_slice(),
            ])
            .to_bytes();
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash = solana_program::keccak::hashv(&[
                &[ONE_BIT],
                proof_element.node.as_slice(),
                computed_hash.as_slice(),
            ])
            .to_bytes();
            // Since the proof element is on the left, we need to increment the index by 2^i
            index += 2u64.pow(i as u32);
        }
    }

    if computed_hash != root {
        return err!(EarnError::InvalidProof);
    }

    Ok(index)
}

pub fn verify_not_in_tree(
    root: [u8; 32],
    value: [u8; 32],
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // The number of proofs should match the number of neighbors
    // TODO we can make this more efficient using a multiproof, see
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/acd4ff74de833399287ed6b31b4debf6b2b35527/contracts/utils/cryptography/MerkleProof.sol#L290

    let len = proofs.len();
    if neighbors.len() != len {
        return err!(EarnError::InvalidProof);
    }

    // We need between 1 and 2 neighbors, depending on the position of the value in the tree
    if len < 1 || len > 2 {
        return err!(EarnError::InvalidProof);
    }

    // Handle the special cases (value is outside the bounds of the tree)
    if len == 1 {
        let neighbor = neighbors[0];
        let proof = &proofs[0];

        if value < neighbor {
            // Value is smaller than the smallest leaf in the tree
            // The neighbor should be the first leaf in the tree
            let neighbor_index = verify_in_tree(root, neighbor, proof.clone())?;

            return if neighbor_index == 0 {
                Ok(())
            } else {
                err!(EarnError::InvalidProof)
            };
        } else if value > neighbor {
            // Value is larger than the largest leaf in the tree

            // Calculate the expected index of the neighbor (last leaf in the tree)
            // based on the length of the proof.
            // @audit I believe this works because we use different bits to hash leafs vs. nodes to protect
            // against second pre-image attacks -> attacker cannot provide a proof that hashes to the root
            // using a subset of the tree (which would be shorter)
            let expected_index = 2u64.pow(proof.len() as u32) - 1;

            let neighbor_index = verify_in_tree(root, neighbor, proof.clone())?;

            return if neighbor_index == expected_index {
                Ok(())
            } else {
                err!(EarnError::InvalidProof)
            };
        } else {
            // Can't be the same as the neighbor
            return err!(EarnError::InvalidProof);
        }
    }

    // Length is 2 -> trying to prove that a value within the bounds of the tree is not in it
    let left_neighbor = neighbors[0];
    let left_proof = &proofs[0];

    let right_neighbor = neighbors[1];
    let right_proof = &proofs[1];

    // Verify that the left neighbor is smaller than the right neighbor and that the value is between them
    if left_neighbor >= right_neighbor || value <= left_neighbor || value >= right_neighbor {
        return err!(EarnError::InvalidProof);
    }

    // Verify that the left neighbor is in the tree
    let left_index = verify_in_tree(root, left_neighbor, left_proof.clone())?;

    // Verify that the right neighbor is in the tree
    let right_index = verify_in_tree(root, right_neighbor, right_proof.clone())?;

    // Verify that the neighbor indices are next to each other
    if left_index + 1 != right_index {
        return err!(EarnError::InvalidProof);
    }

    // The leaf is not in the tree
    Ok(())
}
