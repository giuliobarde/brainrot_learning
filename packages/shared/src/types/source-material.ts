export type SourceMaterialKind = 'text' | 'pdf' | 'docx' | 'markdown' | 'url';

export interface SourceMaterial {
  id: string;
  ownerId: string;
  kind: SourceMaterialKind;
  originalFilename?: string;
  mimeType?: string;
  storagePath?: string;
  extractedText: string;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}
