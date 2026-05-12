import { Router } from 'express';

import { adminVideoController, adminVideoSchemas } from '../controllers/adminVideoController';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';

export const adminVideoRoutes = Router();

adminVideoRoutes.use(requireAuth, requireAdmin);

adminVideoRoutes.post(
  '/admin/videos/generate',
  validate(adminVideoSchemas.GenerateBody, 'body'),
  asyncHandler(adminVideoController.generate),
);

adminVideoRoutes.post(
  '/admin/videos/:id/publish',
  validate(adminVideoSchemas.IdParam, 'params'),
  asyncHandler(adminVideoController.publish),
);

adminVideoRoutes.post(
  '/admin/videos/:id/unpublish',
  validate(adminVideoSchemas.IdParam, 'params'),
  asyncHandler(adminVideoController.unpublish),
);
