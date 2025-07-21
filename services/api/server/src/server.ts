import cors from 'cors';
import express from 'express';
import apicache from 'apicache';
import { rateLimit } from 'express-rate-limit';
import { register } from '../generated';
import { docs } from './docs';
import { configureLogger } from './logger';
import { events } from './events';
import { connectToDatabase } from './db';
import { tokenAccount } from './tokenAccount';
import { extensions } from './extensions';
import { swap } from './swap';

const PORT = process.env.PORT ?? 5500;

const app = express();
app.use(cors());

const [logHandler, logger] = configureLogger();
app.use(logHandler);

if (process.env.DISABLE_CACHE === 'true') {
  logger.info('Cache is disabled');
} else {
  // cache all responses
  const cache = apicache.middleware;
  app.use(cache('15 seconds'));
}

// basic rate limiting
app.use(
  rateLimit({
    windowMs: 5_000,
    limit: 5,
    message: { error: 'Too many requests, please try again later.' },
  }),
);

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
register(app, { events, tokenAccount, extensions, swap });

app.listen(PORT);
logger.info('Server is running', { port: `${PORT}` });

export { logger };
