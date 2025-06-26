import { Db, MongoClient } from 'mongodb';

export let database: Db;

export const connectToDatabase = async () => {
  if (!process.env.MONGO_CONNECTION_STRING) {
    throw new Error('connection string not set');
  }

  const client = await MongoClient.connect(process.env.MONGO_CONNECTION_STRING);
  database = client.db('solana-m-substream');
};
