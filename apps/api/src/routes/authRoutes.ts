import { Router } from 'express';
import { z } from 'zod';

import { authController } from '../controllers/authController';
import { asyncHandler } from '../middleware/asyncHandler';
import { authRateLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';

const RegisterSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
});

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRoutes = Router();

authRoutes.post(
  '/auth/register',
  authRateLimiter,
  validate(RegisterSchema),
  asyncHandler(authController.register),
);
authRoutes.post(
  '/auth/login',
  authRateLimiter,
  validate(LoginSchema),
  asyncHandler(authController.login),
);
authRoutes.post(
  '/auth/refresh',
  authRateLimiter,
  validate(RefreshSchema),
  asyncHandler(authController.refresh),
);
authRoutes.post('/auth/logout', validate(RefreshSchema), asyncHandler(authController.logout));
authRoutes.get('/auth/me', requireAuth, asyncHandler(authController.me));
