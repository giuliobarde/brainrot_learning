import { describe, expect, it } from 'vitest';

import { TopicModel } from '../../src/models/Topic';

describe('TopicModel', () => {
  it('creates and lists topics', async () => {
    await TopicModel.create({ slug: 'biology', displayName: 'Biology' });
    await TopicModel.create({ slug: 'history', displayName: 'History' });

    const all = await TopicModel.find().sort({ slug: 1 });
    expect(all.map((t) => t.slug)).toEqual(['biology', 'history']);
  });

  it('rejects duplicate slugs', async () => {
    await TopicModel.create({ slug: 'math', displayName: 'Math' });
    await expect(TopicModel.create({ slug: 'math', displayName: 'Math 2' })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('declares unique slug index', async () => {
    const indexes = await TopicModel.collection.indexes();
    const slugIdx = indexes.find((i) => i.name === 'slug_1');
    expect(slugIdx?.unique).toBe(true);
  });
});
