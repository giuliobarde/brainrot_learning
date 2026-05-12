import { Router, type Request, type Response } from 'express';

import { adminVideoRoutes } from './adminVideoRoutes';
import { authRoutes } from './authRoutes';
import { healthRoutes } from './healthRoutes';
import { sourceMaterialRoutes } from './sourceMaterialRoutes';
import { videoRoutes } from './videoRoutes';

export function buildRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ data: { name: 'brainrot-api', version: '0.1.0' } });
  });

  router.use(healthRoutes);
  router.use(authRoutes);
  // Public + per-route-auth routers go before routers that apply auth
  // middleware at the router level (sourceMaterialRoutes, adminVideoRoutes).
  router.use(videoRoutes);
  router.use(sourceMaterialRoutes);
  router.use(adminVideoRoutes);

  return router;
}
