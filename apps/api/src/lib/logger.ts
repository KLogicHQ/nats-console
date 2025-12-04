import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel || 'info',
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
});
