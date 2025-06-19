import { Bridge, IndexUpdate, IndexValue } from '../generated/api';
import { EventsService } from '../generated/api/resources/events/service/EventsService';
import { database } from './db';
import { getCurrentIndex } from './evm';
import { parseTimeFilter, parseLimitFilter } from './query';

const parseLimitQuery = (reqQuery: { skip?: number; limit?: number }) => {
  return { skip: Number(reqQuery?.skip ?? 0), limit: Math.min(Number(reqQuery?.limit ?? 100), 1000) };
};

export const events = new EventsService({
  bridges: async (req, res, next) => {
    const { limit, skip } = parseLimitQuery(req.query);

    const coll = database.collection('bridge_events');
    const cursor = coll.find({}, { limit, skip });
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
    const coll = database.collection('index_updates');
    const cursor = coll.aggregate([...parseTimeFilter(req.query), ...parseLimitFilter(req.query)]);
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
    const [solana, ethereum] = await Promise.all([
      new Promise<IndexValue>(async (resolve, _) => {
        const coll = database.collection('index_updates');
        const result = await coll.find({}, { limit: 1 }).toArray();
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
