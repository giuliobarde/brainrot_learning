import { Router } from 'express';

import { videoController, videoSchemas } from '../controllers/videoController';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';

export const videoRoutes = Router();

videoRoutes.get(
  '/videos/:id',
  validate(videoSchemas.IdParam, 'params'),
  asyncHandler(videoController.get),
);

videoRoutes.delete(
  '/videos/:id',
  requireAuth,
  validate(videoSchemas.IdParam, 'params'),
  asyncHandler(videoController.remove),
);
