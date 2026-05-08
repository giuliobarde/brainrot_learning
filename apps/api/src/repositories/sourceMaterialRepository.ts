import type { Types } from 'mongoose';

import { SourceMaterialModel, type SourceMaterialDoc } from '../models/SourceMaterial';

export interface CreateSourceMaterialInput {
  ownerId: Types.ObjectId | string;
  kind: SourceMaterialDoc['kind'];
  originalFilename?: string;
  mimeType?: string;
  storagePath?: string;
  extractedText: string;
}

export const sourceMaterialRepository = {
  create(input: CreateSourceMaterialInput): Promise<SourceMaterialDoc> {
    return SourceMaterialModel.create({
      ...input,
      charCount: input.extractedText.length,
    });
  },
  findById(id: string | Types.ObjectId): Promise<SourceMaterialDoc | null> {
    return SourceMaterialModel.findById(id).exec();
  },
  listByOwner(ownerId: string | Types.ObjectId): Promise<SourceMaterialDoc[]> {
    return SourceMaterialModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  },
  delete(id: string | Types.ObjectId): Promise<SourceMaterialDoc | null> {
    return SourceMaterialModel.findByIdAndDelete(id).exec();
  },
};
