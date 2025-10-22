import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Db, MongoClient, Document } from 'mongodb';

let database: Db;

const connect = async () => {
  if (database) return;

  if (!process.env.MONGO_CONNECTION_STRING) {
    throw new Error('connection string not set');
  }

  const client = await MongoClient.connect(process.env.MONGO_CONNECTION_STRING);
  database = client.db('solana-m-substream');
};

export async function indexUpdates(params: { fromTime: number; toTime?: number }) {
  await connect();

  const steps: Document[] = [
    {
      $match: {
        event: 'index_update_v2',
      },
    },
    {
      $lookup: {
        from: 'transactions',
        localField: 'signature',
        foreignField: 'signature',
        as: 'transaction',
      },
    },
    {
      $unwind: {
        path: '$transaction',
      },
    },
    {
      $match: {
        'transaction.block_time': {
          $gte: new Date(params.fromTime * 1000),
        },
      },
    },
    {
      $sort: {
        'transaction.block_height': -1,
      },
    },
  ];

  if (params.toTime) {
    steps.push({
      $match: {
        'transaction.block_time': {
          $lt: new Date(params.toTime * 1000),
        },
      },
    });
  }

  const cursor = database.collection('events').aggregate(steps);
  const result = await cursor.toArray();

  return result.map((update) => ({
    index: update.index,
    programId: update.program_id,
    signature: update.signature,
    tokenSupply: update.token_supply,
    ts: update.transaction.block_time,
  }));
}

export async function currentIndex() {
  await connect();

  const cursor = database.collection('events').aggregate([
    {
      $match: {
        event: 'index_update_v2',
      },
    },
    {
      $lookup: {
        from: 'transactions',
        localField: 'signature',
        foreignField: 'signature',
        as: 'transaction',
      },
    },
    {
      $unwind: {
        path: '$transaction',
      },
    },
    {
      $sort: {
        'transaction.block_height': -1,
      },
    },
    {
      $limit: 1,
    },
  ]);

  const result = await cursor.toArray();

  return { index: result[0].index, ts: result[0].transaction.block_time };
}

export async function getBalanceAt(tokenAccount: PublicKey, mint: PublicKey, ts: Date): Promise<BN> {
  await connect();

  const cursor = database.collection('balance_updates').aggregate([
    {
      $match: {
        pubkey: tokenAccount,
        mint,
      },
    },
    {
      $lookup: {
        from: 'transactions',
        localField: 'signature',
        foreignField: 'signature',
        as: 'transaction',
      },
    },
    {
      $unwind: {
        path: '$transaction',
      },
    },
    {
      $match: {
        'transaction.block_time': {
          $lt: ts,
        },
      },
    },
    {
      $sort: {
        'transaction.block_height': -1,
      },
    },
    {
      $limit: 1,
    },
  ]);

  const transfers = await cursor.toArray();

  if (transfers.length === 0) {
    return new BN(0);
  }

  return new BN(transfers[0].postBalance);
}
