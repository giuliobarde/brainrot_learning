import type { Types } from 'mongoose';

import { AppError, NotFound } from '../lib/errors';
import { extract, type SourceMaterialKind } from '../lib/extractors';
import { createLocalStorage, type StorageDriver } from '../lib/storage';
import type { SourceMaterialDoc } from '../models/SourceMaterial';
import { sourceMaterialRepository } from '../repositories/sourceMaterialRepository';

export interface UploadFileInput {
  ownerId: string | Types.ObjectId;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface UploadInlineInput {
  ownerId: string | Types.ObjectId;
  text: string;
  filename?: string;
}

export interface SourceMaterialServiceDeps {
  storage?: StorageDriver;
}

export function createSourceMaterialService(deps: SourceMaterialServiceDeps = {}) {
  const storage = deps.storage ?? createLocalStorage();

  async function uploadFile(input: UploadFileInput): Promise<SourceMaterialDoc> {
    const { kind, text } = await extract({
      buffer: input.buffer,
      mimeType: input.mimeType,
      filename: input.filename,
    });
    const stored = await storage.put(String(input.ownerId), input.filename, input.buffer);
    return sourceMaterialRepository.create({
      ownerId: input.ownerId,
      kind,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      storagePath: stored.storagePath,
      extractedText: text,
    });
  }

  async function uploadInline(input: UploadInlineInput): Promise<SourceMaterialDoc> {
    const text = input.text.trim();
    if (text.length === 0) throw new AppError(400, 'empty_text', 'inline text is empty');
    return sourceMaterialRepository.create({
      ownerId: input.ownerId,
      kind: 'text',
      originalFilename: input.filename,
      mimeType: 'text/plain',
      extractedText: text,
    });
  }

  async function getById(
    id: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
  ): Promise<SourceMaterialDoc> {
    const doc = await sourceMaterialRepository.findById(id);
    if (!doc || String(doc.ownerId) !== String(ownerId)) {
      throw NotFound('source material', String(id));
    }
    return doc;
  }

  async function listByOwner(ownerId: string | Types.ObjectId): Promise<SourceMaterialDoc[]> {
    return sourceMaterialRepository.listByOwner(ownerId);
  }

  async function deleteById(
    id: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
  ): Promise<void> {
    const doc = await getById(id, ownerId);
    if (doc.storagePath) {
      try {
        await storage.remove(doc.storagePath);
      } catch {
        // best effort: continue even if file removal fails
      }
    }
    await sourceMaterialRepository.delete(doc._id);
  }

  return { uploadFile, uploadInline, getById, listByOwner, deleteById };
}

export type SourceMaterialService = ReturnType<typeof createSourceMaterialService>;
export type { SourceMaterialKind };
