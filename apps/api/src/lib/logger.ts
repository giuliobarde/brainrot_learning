import pino from 'pino';

import { config } from '../config';

const transport =
  config.env === 'development'
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      }
    : undefined;

export const logger = pino({
  level: config.logLevel,
  base: { service: 'brainrot-api', env: config.env },
  ...(transport ? { transport } : {}),
});
