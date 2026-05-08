import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const memory = await MongoMemoryServer.create();
  const uri = memory.getUri();
  process.env.MONGO_URI = uri;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  // Pass URI to per-file setup via env so workers can connect.
  process.env.__BRAINROT_MONGO_URI = uri;

  return async () => {
    await memory.stop();
  };
}
