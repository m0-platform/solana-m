import { Keypair, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { SolanaPlatform, SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { AccountAddress, sha256, Wormhole } from '@wormhole-foundation/sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');

export function keysFromEnv(keys: string[]) {
  return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key] ?? '[]'))));
}

export function NttManager(connection: Connection, owner: Keypair, mint: PublicKey) {
  const signer = new SolanaSendSigner(connection, 'Solana', owner, false, { min: 300_000 });
  const sender = Wormhole.parseAddress('Solana', signer.address()) as AccountAddress<'Solana'>;

  const wormholeNetwork = process.env.NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [SolanaPlatform]);
  const ctx = wh.getChain('Solana');

  const ntt = new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...ctx.config.contracts,
      ntt: {
        token: mint.toBase58(),
        manager: PORTAL.toBase58(),
        transceiver: {
          wormhole: PORTAL.toBase58(),
        },
        quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
      },
    },
    '3.0.0',
  );

  return { ctx, ntt, signer, sender };
}

export function anchorProvider(connection: Connection, owner: Keypair) {
  return new AnchorProvider(connection, new Wallet(owner), {
    commitment: 'confirmed',
    skipPreflight: false,
  });
}

export function updatePortalMint(owner: PublicKey, config: PublicKey, mMint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PORTAL,
    keys: [
      {
        pubkey: owner,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: config,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mMint,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([Buffer.from(sha256('global:set_mint').subarray(0, 8))]),
  });
}
