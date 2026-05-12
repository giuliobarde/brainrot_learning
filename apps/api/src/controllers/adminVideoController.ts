import type { Request, Response } from 'express';
import { z } from 'zod';

import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors';
import type { AuthedRequest } from '../middleware/requireAuth';
import { getValidated } from '../middleware/validate';
import { videoRepository } from '../repositories/videoRepository';
import { topicService } from '../services/topicService';
import { createVideoGenerationService } from '../services/videoGenerationService';
import { toPublicVideo } from '../services/videoMappers';

const ObjectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

const GenerateBody = z
  .object({
    sourceMaterialId: ObjectId.optional(),
    sourceText: z.string().min(1).max(200_000).optional(),
    topicHint: z.string().trim().max(80).optional(),
    tone: z.enum(['casual', 'energetic', 'serious']).optional(),
    length: z.enum(['short', 'medium', 'long']).optional(),
    voice: z.enum(['narrator', 'narrator-energetic', 'narrator-male']).optional(),
    preferredBackground: z.string().trim().max(120).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.sourceMaterialId) || (typeof v.sourceText === 'string' && v.sourceText.length > 0),
    { message: 'one of sourceMaterialId or sourceText is required' },
  );

const IdParam = z.object({ id: ObjectId });

let cachedService: ReturnType<typeof createVideoGenerationService> | null = null;
function service() {
  if (!cachedService) cachedService = createVideoGenerationService();
  return cachedService;
}

/** Test seam: swap in a stub. */
export function __setAdminVideoGenerationServiceForTests(
  next: ReturnType<typeof createVideoGenerationService> | null,
): void {
  cachedService = next;
}

export const adminVideoController = {
  async generate(req: Request, res: Response): Promise<void> {
    const ownerId = (req as AuthedRequest).userId;
    const body = getValidated<z.infer<typeof GenerateBody>>(req, 'body');
    const video = await service().start({ ownerId, ...body });
    res.status(202).json({ data: { video: toPublicVideo(video) } });
  },

  async publish(req: Request, res: Response): Promise<void> {
    const adminId = (req as AuthedRequest).userId;
    const { id } = getValidated<{ id: string }>(req, 'params');

    const video = await videoRepository.findById(id);
    if (!video) throw NotFound('video', id);
    if (String(video.ownerId) !== adminId) throw Forbidden('not the owner of this video');
    if (video.status !== 'ready') {
      throw Conflict(`cannot publish a video with status=${video.status}`);
    }
    if (!video.topicSlug || video.topicSlug === 'pending') {
      throw BadRequest('video has no topic to publish under');
    }

    await topicService.ensure(video.topic);
    const updated = await videoRepository.publish(id);
    res.json({ data: { video: toPublicVideo(updated!) } });
  },

  async unpublish(req: Request, res: Response): Promise<void> {
    const adminId = (req as AuthedRequest).userId;
    const { id } = getValidated<{ id: string }>(req, 'params');

    const video = await videoRepository.findById(id);
    if (!video) throw NotFound('video', id);
    if (String(video.ownerId) !== adminId) throw Forbidden('not the owner of this video');

    const updated = await videoRepository.unpublish(id);
    res.json({ data: { video: toPublicVideo(updated!) } });
  },
};

export const adminVideoSchemas = { GenerateBody, IdParam };
