import mammoth from 'mammoth';
// pdf-parse's package index runs a debug script that fails in production. Import
// the library entry directly to avoid that.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

import { AppError } from './errors';

export type SourceMaterialKind = 'text' | 'pdf' | 'docx' | 'markdown' | 'url';

export interface ExtractionInput {
  buffer: Buffer;
  mimeType?: string;
  filename?: string;
}

export interface ExtractionResult {
  kind: SourceMaterialKind;
  text: string;
}

const TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream',
]);
const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function detectKind(input: ExtractionInput): SourceMaterialKind {
  const ext = input.filename ? input.filename.toLowerCase().split('.').pop() : undefined;
  if (input.mimeType === PDF_MIME || ext === 'pdf') return 'pdf';
  if (input.mimeType === DOCX_MIME || ext === 'docx') return 'docx';
  if (ext === 'md' || ext === 'markdown' || input.mimeType === 'text/markdown') return 'markdown';
  if (input.mimeType && TEXT_MIME.has(input.mimeType)) return 'text';
  if (ext === 'txt') return 'text';
  throw new AppError(
    415,
    'unsupported_media_type',
    `cannot extract from ${input.mimeType ?? ext ?? 'unknown'}`,
  );
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extract(input: ExtractionInput): Promise<ExtractionResult> {
  const kind = detectKind(input);
  if (input.buffer.length === 0) {
    throw new AppError(400, 'empty_file', 'uploaded file is empty');
  }

  switch (kind) {
    case 'pdf': {
      try {
        const result = await pdfParse(input.buffer);
        const text = normalize(result.text ?? '');
        if (text.length === 0) {
          throw new AppError(422, 'extraction_empty', 'PDF contained no extractable text');
        }
        return { kind, text };
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(422, 'extraction_failed', `PDF parse failed: ${(err as Error).message}`);
      }
    }
    case 'docx': {
      try {
        const result = await mammoth.extractRawText({ buffer: input.buffer });
        const text = normalize(result.value ?? '');
        if (text.length === 0) {
          throw new AppError(422, 'extraction_empty', 'DOCX contained no extractable text');
        }
        return { kind, text };
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(
          422,
          'extraction_failed',
          `DOCX parse failed: ${(err as Error).message}`,
        );
      }
    }
    case 'markdown':
    case 'text': {
      const text = normalize(input.buffer.toString('utf8'));
      if (text.length === 0) {
        throw new AppError(422, 'extraction_empty', 'file contained no text');
      }
      return { kind, text };
    }
    default:
      throw new AppError(415, 'unsupported_media_type', `unsupported kind: ${kind}`);
  }
}

export const _internal = { detectKind, normalize };
