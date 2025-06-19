import cors from 'cors';
import express from 'express';
import apicache from 'apicache';
import { register } from '../generated';
import { docs } from './docs';
import { configureLogger } from './logger';
import { events } from './events';
import { connectToDatabase } from './db';
import { tokenAccount } from './tokenAccount';

const PORT = process.env.PORT ?? 5500;

const app = express();
app.use(cors());

const [logHandler, logger] = configureLogger();
app.use(logHandler);

if (process.env.DISABLE_CACHE === 'true') {
  logger.info('Cache is disabled');
} else {
  // cache all responses for 60 seconds
  const cache = apicache.middleware;
  app.use(cache('60 seconds'));
}

// MongoDB
connectToDatabase()
  .then(() => logger.info('Connected to db'))
  .catch((err) => {
    logger.error('Failed to connect to db', err);
    process.exit(1);
  });

// serve openapi schema.json and docs frontend
app.use('/docs', docs);

// register all services implementation in api spec
register(app, { events, tokenAccount });

app.listen(PORT);
logger.info('Server is running', { port: `${PORT}` });
