import type { Request, Response } from 'express';
import { z } from 'zod';

import { Forbidden, NotFound, Unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import type { AuthedRequest } from '../middleware/requireAuth';
import { getValidated } from '../middleware/validate';
import { videoRepository } from '../repositories/videoRepository';
import { toPublicVideo } from '../services/videoMappers';

const IdParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/) });

function optionalAuthUserId(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    return verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}

export const videoController = {
  async get(req: Request, res: Response): Promise<void> {
    const { id } = getValidated<{ id: string }>(req, 'params');
    const video = await videoRepository.findById(id);
    if (!video) throw NotFound('video', id);

    if (video.visibility === 'public') {
      res.json({ data: { video: toPublicVideo(video) } });
      return;
    }

    const callerId = optionalAuthUserId(req);
    if (!callerId) throw Unauthorized('this video is private');
    if (String(video.ownerId) !== callerId) throw Forbidden('not the owner of this video');

    res.json({ data: { video: toPublicVideo(video) } });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const callerId = (req as AuthedRequest).userId;
    const { id } = getValidated<{ id: string }>(req, 'params');

    const video = await videoRepository.findById(id);
    if (!video) throw NotFound('video', id);
    if (String(video.ownerId) !== callerId) throw Forbidden('not the owner of this video');

    await videoRepository.delete(id);
    res.status(204).send();
  },
};

export const videoSchemas = { IdParam };
