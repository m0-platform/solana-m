import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

export function keysFromEnv(keys: string[]) {
  return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key] ?? '[]'))));
}

export function anchorProvider(connection: Connection, owner: Keypair) {
  return new AnchorProvider(connection, new Wallet(owner), {
    commitment: 'confirmed',
    skipPreflight: false,
  });
}
