import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { sourceMaterialRepository } from '../../src/repositories/sourceMaterialRepository';
import { topicRepository } from '../../src/repositories/topicRepository';
import { userRepository } from '../../src/repositories/userRepository';
import { videoRepository } from '../../src/repositories/videoRepository';

describe('repositories', () => {
  it('userRepository: full CRUD round-trip', async () => {
    const created = await userRepository.create({
      email: 'r@example.com',
      passwordHash: 'h',
      displayName: 'R',
    });
    const fetched = await userRepository.findByEmail('R@Example.com');
    expect(fetched?.id).toBe(created.id);

    const updated = await userRepository.update(created._id, { displayName: 'R2' });
    expect(updated?.displayName).toBe('R2');

    await userRepository.delete(created._id);
    expect(await userRepository.findById(created._id)).toBeNull();
  });

  it('topicRepository.upsert is idempotent on slug', async () => {
    const a = await topicRepository.upsert({ slug: 'physics', displayName: 'Physics' });
    const b = await topicRepository.upsert({ slug: 'physics', displayName: 'Physics 2' });
    expect(a.id).toBe(b.id);
    expect(b.displayName).toBe('Physics');
  });

  it('sourceMaterialRepository auto-fills charCount', async () => {
    const ownerId = new Types.ObjectId();
    const sm = await sourceMaterialRepository.create({
      ownerId,
      kind: 'text',
      extractedText: 'abcdef',
    });
    expect(sm.charCount).toBe(6);

    const list = await sourceMaterialRepository.listByOwner(ownerId);
    expect(list).toHaveLength(1);
  });

  it('videoRepository CRUD + appendLog + filtered list', async () => {
    const ownerId = new Types.ObjectId();
    const created = await videoRepository.create({
      ownerId,
      topic: 'Math',
      topicSlug: 'math',
      title: 'Linear algebra intro',
    });

    await videoRepository.appendLog(created._id, 'queued');
    const after = await videoRepository.findById(created._id);
    expect(after?.processingLogs).toEqual(['queued']);

    await videoRepository.create({
      ownerId,
      topic: 'Math',
      topicSlug: 'math',
      title: 'Calculus basics',
      description: 'Derivatives and integrals',
      tags: ['calculus'],
    });

    const list = await videoRepository.list({ ownerId, topicSlug: 'math' });
    expect(list).toHaveLength(2);

    const search = await videoRepository.list({ ownerId, text: 'derivatives' });
    expect(search.map((v) => v.title)).toContain('Calculus basics');

    await videoRepository.delete(created._id);
    expect(await videoRepository.countByOwner(ownerId)).toBe(1);
  });
});
