import { Router, type Request, type Response } from 'express';

import { authRoutes } from './authRoutes';
import { healthRoutes } from './healthRoutes';

export function buildRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ data: { name: 'brainrot-api', version: '0.1.0' } });
  });

  router.use(healthRoutes);
  router.use(authRoutes);

  return router;
}
