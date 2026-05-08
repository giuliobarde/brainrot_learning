import type { Request, Response } from 'express';
import { z } from 'zod';

import { BadRequest } from '../lib/errors';
import type { AuthedRequest } from '../middleware/requireAuth';
import { getValidated } from '../middleware/validate';
import { createSourceMaterialService } from '../services/sourceMaterialService';
import { toPublicSourceMaterial } from '../services/sourceMaterialMappers';

const InlineBody = z.object({
  text: z.string().min(1).max(200_000),
  filename: z.string().trim().max(120).optional(),
});

const IdParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/) });

const service = createSourceMaterialService();

export const sourceMaterialController = {
  async create(req: Request, res: Response): Promise<void> {
    const ownerId = (req as AuthedRequest).userId;

    if (req.file) {
      const doc = await service.uploadFile({
        ownerId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
      res.status(201).json({ data: { sourceMaterial: toPublicSourceMaterial(doc) } });
      return;
    }

    if (req.body && typeof req.body.text === 'string') {
      const body = InlineBody.parse(req.body);
      const doc = await service.uploadInline({ ownerId, ...body });
      res.status(201).json({ data: { sourceMaterial: toPublicSourceMaterial(doc) } });
      return;
    }

    throw BadRequest('expected multipart "file" upload or JSON body with "text"');
  },

  async list(req: Request, res: Response): Promise<void> {
    const ownerId = (req as AuthedRequest).userId;
    const docs = await service.listByOwner(ownerId);
    res.json({
      data: { sourceMaterials: docs.map(toPublicSourceMaterial) },
    });
  },

  async get(req: Request, res: Response): Promise<void> {
    const ownerId = (req as AuthedRequest).userId;
    const { id } = getValidated<{ id: string }>(req, 'params');
    const doc = await service.getById(id, ownerId);
    res.json({
      data: {
        sourceMaterial: {
          ...toPublicSourceMaterial(doc),
          extractedText: doc.extractedText,
        },
      },
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const ownerId = (req as AuthedRequest).userId;
    const { id } = getValidated<{ id: string }>(req, 'params');
    await service.deleteById(id, ownerId);
    res.status(204).send();
  },
};

export const sourceMaterialSchemas = { IdParam };
