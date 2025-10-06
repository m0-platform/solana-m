import { Bridge, IndexUpdate, IndexValue } from '../generated/api';
import { EventsService } from '../generated/api/resources/events/service/EventsService';
import { database } from './db';
import { getCurrentIndex } from './evm';
import { parseTimeFilter, parseLimitFilter } from './query';

export const events = new EventsService({
  bridges: async (req, res, next) => {
    const cursor = database.collection('events').aggregate([
      {
        $match: {
          event: 'bridge',
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
      ...parseTimeFilter(req.query),
      {
        $sort: {
          'transaction.block_height': -1,
        },
      },
      ...parseLimitFilter(req.query),
    ]);

    const result = await cursor.toArray();

    res.send({
      bridges: result.map((bridge) => {
        const bridgeEvent: Bridge = {
          amount: bridge.amount,
          chain: bridge.chain,
          from: bridge.from,
          to: bridge.to,
          programId: bridge.program_id,
          signature: bridge.signature,
          tokenSupply: bridge.token_supply,
          ts: bridge.transaction.block_time,
        };
        return bridgeEvent;
      }),
    });
  },

  indexUpdates: async (req, res, next) => {
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
      ...parseTimeFilter(req.query),
      {
        $sort: {
          'transaction.block_height': -1,
        },
      },
      ...parseLimitFilter(req.query),
    ]);

    const result = await cursor.toArray();

    res.send({
      updates: result.map((update) => {
        const updateEvent: IndexUpdate = {
          index: update.index,
          programId: update.program_id,
          signature: update.signature,
          tokenSupply: update.token_supply,
          ts: update.transaction.block_time,
        };
        return updateEvent;
      }),
    });
  },

  currentIndex: async (req, res, next) => {
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

    const [solana, ethereum] = await Promise.all([
      new Promise<IndexValue>(async (resolve, _) => {
        const coll = database.collection('index_updates');
        resolve({ index: result[0].index, ts: result[0].transaction.block_time });
      }),
      new Promise<IndexValue>(async (resolve, _) => {
        const index = await getCurrentIndex();
        resolve({ index: index, ts: new Date() });
      }),
    ]);

    res.send({
      solana,
      ethereum,
    });
  },
});
