import { Router } from 'express';

import {
  sourceMaterialController,
  sourceMaterialSchemas,
} from '../controllers/sourceMaterialController';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/requireAuth';
import { sourceUploadMiddleware } from '../middleware/upload';
import { validate } from '../middleware/validate';

export const sourceMaterialRoutes = Router();

sourceMaterialRoutes.use(requireAuth);

sourceMaterialRoutes.post(
  '/source-material',
  sourceUploadMiddleware,
  asyncHandler(sourceMaterialController.create),
);

sourceMaterialRoutes.get('/source-material', asyncHandler(sourceMaterialController.list));

sourceMaterialRoutes.get(
  '/source-material/:id',
  validate(sourceMaterialSchemas.IdParam, 'params'),
  asyncHandler(sourceMaterialController.get),
);

sourceMaterialRoutes.delete(
  '/source-material/:id',
  validate(sourceMaterialSchemas.IdParam, 'params'),
  asyncHandler(sourceMaterialController.remove),
);
