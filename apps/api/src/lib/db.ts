import mongoose from 'mongoose';

import { config } from '../config';
import { logger } from './logger';

mongoose.set('strictQuery', true);

let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo(uri: string = config.mongoUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  connecting = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 10_000 })
    .then((m) => {
      logger.info({ host: m.connection.host, name: m.connection.name }, 'mongo connected');
      return m;
    })
    .catch((err) => {
      connecting = null;
      throw err;
    });

  return connecting;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  connecting = null;
  logger.info('mongo disconnected');
}

export async function pingMongo(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  const result = await mongoose.connection.db.admin().ping();
  return result?.ok === 1;
}
