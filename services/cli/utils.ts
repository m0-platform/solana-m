import { Keypair, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { sha256 } from '@noble/hashes/sha256';

const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');
const PORTALV2 = new PublicKey('MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce');

export function keysFromEnv(keys: string[]) {
  return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key] ?? '[]'))));
}

export function anchorProvider(connection: Connection, owner: Keypair) {
  return new AnchorProvider(connection, new Wallet(owner), {
    commitment: 'confirmed',
    skipPreflight: false,
  });
}

export function updateMintAuthority(owner: PublicKey, mMint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PORTAL,
    keys: [
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('config')], PORTAL)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: owner,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: mMint,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PORTAL)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('authority')], PORTALV2)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_2022_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.from(sha256('global:set_token_authority_one_step_unchecked').subarray(0, 8)),
  });
}
