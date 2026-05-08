import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/lib/errors';
import { extract } from '../../src/lib/extractors';

describe('extractors', () => {
  it('extracts plain text', async () => {
    const buf = Buffer.from('Hello world.\r\nSecond line.', 'utf8');
    const r = await extract({ buffer: buf, mimeType: 'text/plain', filename: 'a.txt' });
    expect(r.kind).toBe('text');
    expect(r.text).toBe('Hello world.\nSecond line.');
  });

  it('extracts markdown by extension', async () => {
    const buf = Buffer.from('# Title\n\nbody', 'utf8');
    const r = await extract({
      buffer: buf,
      mimeType: 'application/octet-stream',
      filename: 'notes.md',
    });
    expect(r.kind).toBe('markdown');
    expect(r.text).toContain('# Title');
  });

  it('rejects unsupported mime + extension', async () => {
    await expect(
      extract({
        buffer: Buffer.from([1, 2, 3]),
        mimeType: 'application/x-tar',
        filename: 'archive.tar',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects empty buffer', async () => {
    await expect(
      extract({ buffer: Buffer.alloc(0), mimeType: 'text/plain', filename: 'x.txt' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'empty_file' });
  });

  it('rejects whitespace-only text', async () => {
    await expect(
      extract({ buffer: Buffer.from('   \n  '), mimeType: 'text/plain', filename: 'x.txt' }),
    ).rejects.toMatchObject({ code: 'extraction_empty' });
  });

  it('rejects DOCX with garbage bytes', async () => {
    await expect(
      extract({
        buffer: Buffer.from('not a docx file at all'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'broken.docx',
      }),
    ).rejects.toMatchObject({ code: 'extraction_failed' });
  });

  it('rejects PDF with garbage bytes', async () => {
    await expect(
      extract({
        buffer: Buffer.from('not a pdf at all'),
        mimeType: 'application/pdf',
        filename: 'broken.pdf',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
