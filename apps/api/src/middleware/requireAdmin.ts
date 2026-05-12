import type { NextFunction, Request, Response } from 'express';

import { Forbidden, Unauthorized } from '../lib/errors';
import { userRepository } from '../repositories/userRepository';

import type { AuthedRequest } from './requireAuth';

export interface AdminRequest extends AuthedRequest {
  isAdmin: true;
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req as AuthedRequest).userId;
  if (!userId) {
    next(Unauthorized());
    return;
  }
  const user = await userRepository.findById(userId);
  if (!user) {
    next(Unauthorized());
    return;
  }
  if (user.role !== 'admin') {
    next(Forbidden('admin role required'));
    return;
  }
  (req as AdminRequest).isAdmin = true;
  next();
}
