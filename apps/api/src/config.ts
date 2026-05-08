import { existsSync } from 'node:fs';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

function loadDotenv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      loadEnv({ path: p });
      return;
    }
  }
}
loadDotenv();

const ConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(4000),
  mongoUri: z.string().min(1),
  jwtAccessSecret: z.string().min(1),
  jwtRefreshSecret: z.string().min(1),
  huggingFaceToken: z.string().default(''),
  storageRoot: z.string().default('./storage'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/brainrot',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    huggingFaceToken: process.env.HUGGINGFACE_TOKEN,
    storageRoot: process.env.STORAGE_ROOT,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const config = loadConfig();
