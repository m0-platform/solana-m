import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

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
