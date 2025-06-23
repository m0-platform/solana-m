import winston from 'winston';

export interface Logger {
  debug: (message: string, ...meta: any[]) => void;
  info: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  error: {
    (message: string, ...meta: any[]): void;
    (message: Error): void;
  };
}

export class MockLogger implements Logger {
  debug(m: string, ...meta: any[]) {}
  info(m: string, ...meta: any[]) {}
  warn(m: string, ...meta: any[]) {}
  error(m: string | Error, ...meta: any[]): void {}
}

export class ConsoleLogger implements Logger {
  debug = console.debug;
  info = console.log;
  warn = console.warn;
  error = console.error;
}

export class WinstonLogger implements Logger {
  logger: winston.Logger;

  constructor(name: string, defaultMeta: { [key: string]: string } = {}, catchConsoleLogs = true) {
    let format: winston.Logform.Format;
    let level = 'info';

    if (process.env.NODE_ENV !== 'production') {
      level = 'debug';
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

    this.logger = winston.createLogger({
      level,
      format,
      defaultMeta: { name, ...defaultMeta },
      transports: [new winston.transports.Console()],
    });

    if (catchConsoleLogs) {
      console.debug = this.debug;
      console.info = this.info;
      console.warn = this.warn;
      console.error = this.error;
    }
  }

  debug = (m: string, ...meta: any[]) => this.logger.debug(m, ...meta);
  info = (m: string, ...meta: any[]) => this.logger.info(m, ...meta);
  warn = (m: string, ...meta: any[]) => this.logger.warn(m, ...meta);
  error = (message: string | Error, ...meta: any[]): void => {
    if (message instanceof Error) this.logger.error(message);
    else this.logger.error(message, ...meta);
  };

  withTransport(transport: winston.transport) {
    this.logger.add(transport);
  }

  addMetaField(key: string, value: string) {
    this.logger.defaultMeta[key] = value;
  }
}
