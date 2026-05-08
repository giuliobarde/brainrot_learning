import type { Request, Response } from 'express';

import { healthService } from '../services/healthService';

export const healthController = {
  async healthz(_req: Request, res: Response): Promise<void> {
    const snapshot = await healthService.check();
    res.status(snapshot.status === 'ok' ? 200 : 503).json({ data: snapshot });
  },
};
