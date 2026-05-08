import { createApp } from './app';
import { config } from './config';
import { connectMongo, disconnectMongo } from './lib/db';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  await connectMongo();
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'api listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void disconnectMongo().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
