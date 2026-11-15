import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EARN_PROGRAM_ID, currentIndex, disconnect, indexUpdates } from '../../sdk/src/db';

const FOREIGN_PROGRAM_ID = 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko';

describe('index queries', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGO_CONNECTION_STRING = server.getUri();

    client = await MongoClient.connect(server.getUri());
    const db = client.db('solana-m-substream');

    // two earn updates, then a newer and larger update from another program
    const updates = [
      { signature: 'earn-1', program_id: EARN_PROGRAM_ID, index: 1_100_000_000_000, height: 1 },
      { signature: 'earn-2', program_id: EARN_PROGRAM_ID, index: 1_200_000_000_000, height: 2 },
      { signature: 'foreign', program_id: FOREIGN_PROGRAM_ID, index: 9_900_000_000_000, height: 3 },
    ];
    await db.collection('events').insertMany(
      updates.map((u) => ({
        event: 'index_update_v2',
        program_id: u.program_id,
        index: u.index,
        signature: u.signature,
      })),
    );
    await db.collection('transactions').insertMany(
      updates.map((u) => ({
        signature: u.signature,
        block_height: u.height,
        block_time: new Date((1_700_000_000 + u.height * 86400) * 1000),
      })),
    );
  }, 120_000);

  afterAll(async () => {
    await disconnect();
    await client.close();
    await server.stop();
  });

  test('indexUpdates keeps earn rows and excludes a foreign index_update_v2', async () => {
    const updates = await indexUpdates({ fromTime: 0 });
    expect(updates.map((u) => u.index)).toEqual([1_200_000_000_000, 1_100_000_000_000]);
  });

  test('currentIndex ignores a newer foreign index_update_v2', async () => {
    expect((await currentIndex()).index).toBe(1_200_000_000_000);
  });

  test('currentIndex throws when the earn program has no index updates', async () => {
    await client.db('solana-m-substream').collection('events').deleteMany({ program_id: EARN_PROGRAM_ID });
    await expect(currentIndex()).rejects.toThrow(`No index_update_v2 events from ${EARN_PROGRAM_ID}`);
  });
});
