import type { Request, Response } from 'express';

import { Unauthorized } from '../lib/errors';
import type { AuthedRequest } from '../middleware/requireAuth';
import { getValidated } from '../middleware/validate';
import { authService } from '../services/authService';
import { toPublicUser } from '../services/userMappers';
import { userService } from '../services/userService';

export interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
}
export interface LoginBody {
  email: string;
  password: string;
}
export interface RefreshBody {
  refreshToken: string;
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const body = getValidated<RegisterBody>(req, 'body');
    const { user, tokens } = await authService.register(body);
    res.status(201).json({ data: { user: toPublicUser(user), tokens } });
  },

  async login(req: Request, res: Response): Promise<void> {
    const body = getValidated<LoginBody>(req, 'body');
    const { user, tokens } = await authService.login(body);
    res.json({ data: { user: toPublicUser(user), tokens } });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const body = getValidated<RefreshBody>(req, 'body');
    const { user, tokens } = await authService.refresh(body.refreshToken);
    res.json({ data: { user: toPublicUser(user), tokens } });
  },

  async logout(req: Request, res: Response): Promise<void> {
    const body = getValidated<RefreshBody>(req, 'body');
    await authService.logout(body.refreshToken);
    res.status(204).send();
  },

  async me(req: Request, res: Response): Promise<void> {
    const userId = (req as AuthedRequest).userId;
    if (!userId) throw Unauthorized();
    const user = await userService.getById(userId);
    res.json({ data: { user: toPublicUser(user) } });
  },
};
