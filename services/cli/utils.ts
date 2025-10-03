import { Keypair, Connection, PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { AccountAddress, Chain, Network, sha256, Signer, Wormhole } from '@wormhole-foundation/sdk';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import solana from '@wormhole-foundation/sdk/platforms/solana';

const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');

export function keysFromEnv(keys: string[]) {
  return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key] ?? '[]'))));
}

export function isEVM(chain: Chain) {
  return !['Solana', 'Fogo'].includes(chain);
}

export function NttManager(connection: Connection, owner: Keypair, mint: PublicKey) {
  const signer = new SolanaSendSigner(connection, 'Solana', owner, false, { min: 300_000 }) as Signer<Network, Chain>;
  const sender = Wormhole.parseAddress('Solana', signer.address()) as AccountAddress<'Solana'>;

  const wormholeNetwork = process.env.NETWORK?.includes('devnet') ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [solana.Platform]);
  const ctx = wh.getChain('Solana');

  const contracts = ctx.config.contracts;
  if (process.env.NETWORK!.includes('fogo')) {
    contracts.coreBridge = 'BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4';
  }

  const ntt = new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...contracts,
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
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PORTAL)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getAssociatedTokenAddressSync(
          mMint,
          PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PORTAL)[0],
          true,
          TOKEN_2022_PROGRAM_ID,
        ),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: PublicKey.findProgramAddressSync(
          [Buffer.from('global')],
          new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z'),
        )[0],
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([Buffer.from(sha256('global:set_mint').subarray(0, 8))]),
  });
}

export function initResolverAccount(owner: PublicKey, config: PublicKey, swapLUT?: PublicKey) {
  return new TransactionInstruction({
    programId: PORTAL,
    keys: [
      {
        pubkey: owner,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: config,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('executor-account-resolver:result')], PORTAL)[0],
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      Buffer.from(sha256('global:initialize_resolver_accounts').subarray(0, 8)), // discriminator
      new BN(swapLUT ? 1 : 0).toArrayLike(Buffer, 'le', 1), // optional flag for lut
      swapLUT?.toBuffer() ?? Buffer.from([]),
    ]),
  });
}
