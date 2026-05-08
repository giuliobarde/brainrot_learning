import type { NextFunction, Request, Response } from 'express';

import { Unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthedRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(Unauthorized('missing bearer token'));
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    next(Unauthorized('missing bearer token'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    (req as AuthedRequest).userId = payload.sub;
    next();
  } catch {
    next(Unauthorized('invalid or expired token'));
  }
}
