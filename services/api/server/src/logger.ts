import winston from 'winston';
import LokiTransport from 'winston-loki';
import expressWinston from 'express-winston';
import { Handler } from 'express';

export const configureLogger = (): [Handler, winston.Logger] => {
  const transports: winston.transport[] = [new winston.transports.Console()];
  let format: winston.Logform.Format;

  if (!process.env.BASE_URL || process.env.BASE_URL.includes('localhost')) {
    format = winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.simple(),
    );
  } else {
    format = winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.json(),
    );
  }

  if (process.env.LOKI_URL) {
    const transport = new LokiTransport({
      host: process.env.LOKI_URL,
      json: true,
      useWinstonMetaAsLabels: true,
      format,
      batching: true,
      timeout: 15_000,
      onConnectionError: (error: any) => {
        console.error('Loki connection error:', error);
      },
    });

    transports.push(transport);
  }

  const handler = expressWinston.logger({
    transports,
    format,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}}',
    expressFormat: true,
    baseMeta: { name: 'solana-m-api' },
    ignoreRoute: function (req, res) {
      return false;
    },
  });

  const logger = winston.createLogger({
    format,
    defaultMeta: { name: 'solana-m-api' },
    transports,
  });

  return [handler, logger];
};
