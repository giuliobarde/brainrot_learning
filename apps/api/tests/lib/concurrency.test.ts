import { describe, expect, it } from 'vitest';

import { pLimit } from '../../src/lib/concurrency';

describe('pLimit', () => {
  it('runs jobs but never above the configured limit', async () => {
    const limit = pLimit(3);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return i;
      }),
    );
    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('rejects an invalid limit', () => {
    expect(() => pLimit(0)).toThrow();
  });

  it('propagates rejections without stalling the queue', async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(() => Promise.reject(new Error('boom'))),
      limit(() => Promise.resolve(1)),
      limit(() => Promise.resolve(2)),
    ]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    expect(results[2]?.status).toBe('fulfilled');
  });
});
