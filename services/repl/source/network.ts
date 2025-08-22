import { M0SolanaApi, M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
import { createApproveInstruction, getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { UniversalAddress, Wormhole } from '@wormhole-foundation/sdk';
import { NTT, SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import solana from '@wormhole-foundation/sdk/platforms/solana';

const M = new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo');

export function getApiClient() {
  return new M0SolanaApiClient({
    environment: process.env.NETWORK! === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
  });
}

export async function createBridgeFromSolana(
  sender: PublicKey,
  amount: string,
  outboxItem: PublicKey,
  recipientAddress: string,
  recipientChain = 'Ethereum',
) {
  const ixs: TransactionInstruction[] = [];

  const ntt = NttManager();

  const destination = {
    address: new UniversalAddress(recipientAddress, 'hex'),
    chain: recipientChain as 'Ethereum',
  };

  const from = await getAssociatedTokenAddress(M, sender, true, TOKEN_2022_PROGRAM_ID);
  const transferArgs = NTT.transferArgs(BigInt(amount), destination, false);

  ixs.push(
    createApproveInstruction(
      from,
      this.pdas.sessionAuthority(sender, transferArgs),
      sender,
      BigInt(amount),
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  ixs.push(
    await NTT.createTransferBurnInstruction(
      this.program,
      await ntt.getConfig(),
      {
        transferArgs,
        payer: sender,
        from,
        fromAuthority: sender,
        outboxItem,
      },
      this.pdas,
    ),
  );

  const whTransceiver = await ntt.getWormholeTransceiver();
  if (whTransceiver) {
    ixs.push(await whTransceiver.createReleaseWormholeOutboundIx(sender, outboxItem, true));
  }

  const fee = await ntt.quoteDeliveryPrice(destination.chain, { queue: false, automatic: true });

  ixs.push(
    await this.quoter.createRequestRelayInstruction(
      sender,
      outboxItem,
      destination.chain,
      Number(fee) / LAMPORTS_PER_SOL,
      0,
    ),
  );

  const lut = (await ntt.program.account.LUT.fetchNullable(ntt.pdas.lutAccount())).address;

  return { ixs, lut };
}

function NttManager() {
  const connection = new Connection(process.env.RPC_URL!, 'confirmed');
  const wormholeNetwork = process.env.NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [solana.Platform]);
  const ctx = wh.getChain('Solana');

  return new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...ctx.config.contracts,
      ntt: {
        token: M.toBase58(),
        manager: 'mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY',
        transceiver: {
          wormhole: 'mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY',
        },
        quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
      },
    },
    '3.0.0',
  );
}

export function convertApiInstructions(ixs: M0SolanaApi.Instruction[]): TransactionInstruction[] {
  return ixs.map((ix) => {
    const keys = ix.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }));
    return new TransactionInstruction({
      keys,
      programId: new PublicKey(ix.programId),
      data: Buffer.from(ix.data, 'base64'),
    });
  });
}

export async function buildTransaction(
  sender: PublicKey,
  ixs: TransactionInstruction[],
  luts: PublicKey[],
): Promise<VersionedTransaction> {
  const connection = new Connection(process.env.RPC_URL!, 'confirmed');

  const resolvedLuts: AddressLookupTableAccount[] = [];
  for (const lut of luts) {
    resolvedLuts.push((await connection.getAddressLookupTable(lut)).value);
  }

  const messageV0 = new TransactionMessage({
    payerKey: sender,
    instructions: ixs,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  }).compileToV0Message(resolvedLuts);

  return new VersionedTransaction(messageV0);
}
