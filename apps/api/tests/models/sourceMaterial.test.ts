import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { SourceMaterialModel } from '../../src/models/SourceMaterial';

describe('SourceMaterialModel', () => {
  it('creates source material and stores extracted text', async () => {
    const ownerId = new Types.ObjectId();
    const sm = await SourceMaterialModel.create({
      ownerId,
      kind: 'text',
      extractedText: 'hello world',
      charCount: 11,
    });

    expect(sm.charCount).toBe(11);
    expect(sm.kind).toBe('text');
  });

  it('rejects unknown kinds', async () => {
    await expect(
      SourceMaterialModel.create({
        ownerId: new Types.ObjectId(),
        kind: 'audio' as never,
        extractedText: 'x',
        charCount: 1,
      }),
    ).rejects.toThrow();
  });

  it('indexes (ownerId, createdAt desc)', async () => {
    const indexes = await SourceMaterialModel.collection.indexes();
    const compound = indexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ ownerId: 1, createdAt: -1 }),
    );
    expect(compound).toBeDefined();
  });
});
