import { pingMongo } from '../lib/db';

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  mongo: { status: 'up' | 'down'; latencyMs?: number };
}

export const healthService = {
  async check(): Promise<HealthSnapshot> {
    const started = process.hrtime.bigint();
    let mongoUp = false;
    try {
      mongoUp = await pingMongo();
    } catch {
      mongoUp = false;
    }
    const latencyMs = Number((process.hrtime.bigint() - started) / 1_000_000n);

    return {
      status: mongoUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      mongo: { status: mongoUp ? 'up' : 'down', latencyMs },
    };
  },
};
