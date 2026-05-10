import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { VideoModel } from '../../src/models/Video';

async function seedThree(ownerId: Types.ObjectId) {
  await VideoModel.create({
    ownerId,
    topic: 'Biology',
    topicSlug: 'biology',
    title: 'Mitosis explained',
    description: 'Cell division narrated over parkour',
    tags: ['cells', 'division'],
  });
  await VideoModel.create({
    ownerId,
    topic: 'History',
    topicSlug: 'history',
    title: 'Roman aqueducts',
    description: 'How aqueducts worked',
    tags: ['rome', 'engineering'],
  });
  await VideoModel.create({
    ownerId,
    topic: 'Biology',
    topicSlug: 'biology',
    title: 'Photosynthesis basics',
    description: 'Light into sugar',
    tags: ['plants', 'cells'],
  });
}

describe('VideoModel', () => {
  it('creates a video with default status pending and empty assets', async () => {
    const ownerId = new Types.ObjectId();
    const v = await VideoModel.create({
      ownerId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'T',
      description: 'd',
      tags: [],
    });
    expect(v.status).toBe('pending');
    expect(v.assets).toBeDefined();
    expect(v.processingLogs).toEqual([]);
  });

  it('queries by ownerId + topicSlug', async () => {
    const ownerId = new Types.ObjectId();
    await seedThree(ownerId);
    const bio = await VideoModel.find({ ownerId, topicSlug: 'biology' });
    expect(bio).toHaveLength(2);
  });

  it('full-text search hits title, description, tags', async () => {
    const ownerId = new Types.ObjectId();
    await seedThree(ownerId);

    const byTitle = await VideoModel.find({ ownerId, $text: { $search: 'aqueducts' } });
    expect(byTitle.map((v) => v.title)).toContain('Roman aqueducts');

    const byTag = await VideoModel.find({ ownerId, $text: { $search: 'plants' } });
    expect(byTag.map((v) => v.title)).toContain('Photosynthesis basics');

    const byDesc = await VideoModel.find({ ownerId, $text: { $search: 'parkour' } });
    expect(byDesc.map((v) => v.title)).toContain('Mitosis explained');
  });

  it('declares hot-path indexes', async () => {
    const indexes = await VideoModel.collection.indexes();
    const haveKey = (key: Record<string, number | string>) =>
      indexes.some((i) => JSON.stringify(i.key) === JSON.stringify(key));

    expect(haveKey({ ownerId: 1, topicSlug: 1, createdAt: -1 })).toBe(true);
    expect(haveKey({ ownerId: 1, createdAt: -1 })).toBe(true);
    expect(haveKey({ visibility: 1, topicSlug: 1, publishedAt: -1 })).toBe(true);
    expect(haveKey({ visibility: 1, publishedAt: -1 })).toBe(true);

    const text = indexes.find((i) => i.name === 'video_text_index');
    expect(text).toBeDefined();
    expect(text?.weights).toMatchObject({ title: 5, description: 1, tags: 3 });
  });

  it('defaults visibility to private when not specified', async () => {
    const v = await VideoModel.create({
      ownerId: new Types.ObjectId(),
      topic: 'X',
      topicSlug: 'x',
      title: 'private draft',
    });
    expect(v.visibility).toBe('private');
    expect(v.publishedAt).toBeUndefined();
  });

  it('accepts public visibility with publishedAt', async () => {
    const v = await VideoModel.create({
      ownerId: new Types.ObjectId(),
      topic: 'Y',
      topicSlug: 'y',
      title: 'admin published',
      visibility: 'public',
      publishedAt: new Date(),
    });
    expect(v.visibility).toBe('public');
    expect(v.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid visibility values', async () => {
    await expect(
      VideoModel.create({
        ownerId: new Types.ObjectId(),
        topic: 'Z',
        topicSlug: 'z',
        title: 'bad',
        visibility: 'world' as never,
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid status values', async () => {
    await expect(
      VideoModel.create({
        ownerId: new Types.ObjectId(),
        topic: 'X',
        topicSlug: 'x',
        title: 'T',
        status: 'unknown' as never,
      }),
    ).rejects.toThrow();
  });
});
