import type { SourceMaterialDoc } from '../models/SourceMaterial';

export interface PublicSourceMaterial {
  id: string;
  kind: string;
  originalFilename?: string;
  mimeType?: string;
  charCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

const PREVIEW_CHARS = 240;

export function toPublicSourceMaterial(doc: SourceMaterialDoc): PublicSourceMaterial {
  return {
    id: doc.id,
    kind: doc.kind,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    charCount: doc.charCount,
    preview:
      doc.extractedText.length > PREVIEW_CHARS
        ? `${doc.extractedText.slice(0, PREVIEW_CHARS)}…`
        : doc.extractedText,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
