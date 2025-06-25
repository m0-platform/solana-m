import { EarnAuthority, Logger, PROGRAM_ID } from '@m0-foundation/solana-m-sdk';
import { MongoClient } from 'mongodb';
import { ParsedOptions } from './main';
import { PublicKey } from '@solana/web3.js';

export async function persistDevnetIndex(opt: ParsedOptions, logger: Logger, pid: PublicKey) {
  if (!opt.isDevnet) {
    throw new Error('This function should only be called on devnet');
  }

  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, pid, logger);
  const earner = (await auth.getAllEarners())[0];

  const indexUpdates = [];
  const transactions = [];

  for (const [index, ts] of [
    [earner.data.lastClaimIndex, earner.data.lastClaimTimestamp],
    [auth['earnGlobal'].index, auth['earnGlobal'].timestamp],
  ]) {
    // dummy signature
    const sig = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const date = new Date(ts.toNumber() * 1000);

    indexUpdates.push({
      event: 'index_update',
      index: index.toNumber(),
      instruction: 'PropagateIndex',
      max_yield: '1000',
      program_id: PROGRAM_ID.toBase58(),
      signature: sig,
      token_supply: 1000000,
      ts: date,
    });

    transactions.push({
      block_height: 1 + indexUpdates.length,
      block_time: date,
      // random blockhash
      blockhash: Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      signature: sig,
      slot: 1 + indexUpdates.length,
    });
  }

  // persist indexes that the API will use
  const client = await MongoClient.connect(process.env.MONGO_CONNECTION_STRING!);
  const db = client.db('solana-m-substream');
  await db.collection('events').deleteMany({ event: 'index_update' });
  await db.collection('transactions').insertMany(transactions);
  await db.collection('events').insertMany(indexUpdates);
}
