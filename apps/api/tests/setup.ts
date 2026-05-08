import mongoose from 'mongoose';
import { afterEach, beforeAll } from 'vitest';

beforeAll(async () => {
  const uri = process.env.__BRAINROT_MONGO_URI ?? process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing in test environment');
  process.env.MONGO_URI = uri;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  const { connectMongo } = await import('../src/lib/db');
  await connectMongo(uri);

  const { UserModel } = await import('../src/models/User');
  const { VideoModel } = await import('../src/models/Video');
  const { SourceMaterialModel } = await import('../src/models/SourceMaterial');
  const { TopicModel } = await import('../src/models/Topic');
  const { RefreshTokenModel } = await import('../src/models/RefreshToken');
  await Promise.all([
    UserModel.init(),
    VideoModel.init(),
    SourceMaterialModel.init(),
    TopicModel.init(),
    RefreshTokenModel.init(),
  ]);
}, 60_000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});
