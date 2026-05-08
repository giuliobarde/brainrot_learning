import { Router } from 'express';

import { healthController } from '../controllers/healthController';
import { asyncHandler } from '../middleware/asyncHandler';

export const healthRoutes = Router();

healthRoutes.get('/healthz', asyncHandler(healthController.healthz));
