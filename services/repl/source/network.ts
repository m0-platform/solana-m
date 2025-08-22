import { M0SolanaApi, M0SolanaApiClient, M0SolanaApiEnvironment } from '@m0-foundation/solana-m-api-sdk';
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const M = new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo');

export function getApiClient() {
  return new M0SolanaApiClient({
    environment: process.env.NETWORK! === 'devnet' ? M0SolanaApiEnvironment.Devnet : M0SolanaApiEnvironment.Mainnet,
  });
}

export function convertApiInstruction(ix: M0SolanaApi.Instruction): TransactionInstruction {
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
}

export async function buildTransaction(
  sender: PublicKey,
  ixs: (TransactionInstruction | M0SolanaApi.Instruction)[],
  luts: (PublicKey | string)[],
): Promise<VersionedTransaction> {
  const connection = new Connection(process.env.RPC_URL!, 'confirmed');

  const resolvedLuts: AddressLookupTableAccount[] = [];
  for (const lut of luts) {
    resolvedLuts.push((await connection.getAddressLookupTable(new PublicKey(lut))).value);
  }

  const convertedIxs = ixs.map((ix) => {
    if (typeof ix.data === 'string') return convertApiInstruction(ix as M0SolanaApi.Instruction);
    return ix as TransactionInstruction;
  });

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: sender,
      instructions: convertedIxs,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    }).compileToV0Message(resolvedLuts),
  );

  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  if (sim.value.err) {
    throw new Error(`Transaction simulation failed: ${Buffer.from(tx.serialize()).toString('base64')}`);
  }

  return tx;
}
