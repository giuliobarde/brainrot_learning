import { describe, expect, it } from 'vitest';

import { createJobQueue } from '../../src/lib/jobQueue';

describe('jobQueue', () => {
  it('runs jobs in FIFO order at concurrency 1', async () => {
    const queue = createJobQueue({ concurrency: 1 });
    const order: string[] = [];
    const a = queue.enqueue('a', async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('a');
      return 'a';
    });
    const b = queue.enqueue('b', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('b');
      return 'b';
    });
    const c = queue.enqueue('c', async () => {
      order.push('c');
      return 'c';
    });

    await Promise.all([a, b, c]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('resolves enqueue() with the job return value', async () => {
    const queue = createJobQueue();
    const out = await queue.enqueue('m', async () => 42);
    expect(out).toBe(42);
  });

  it('rejects enqueue() when the job throws but stays usable', async () => {
    const queue = createJobQueue();
    await expect(
      queue.enqueue('boom', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const after = await queue.enqueue('ok', async () => 'still alive');
    expect(after).toBe('still alive');
  });

  it('respects concurrency cap', async () => {
    const queue = createJobQueue({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 8 }, (_, i) =>
      queue.enqueue(`j${i}`, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
      }),
    );
    await Promise.all(jobs);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('drain() resolves once all jobs are done', async () => {
    const queue = createJobQueue();
    queue.enqueue('1', async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    queue.enqueue('2', async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    await queue.drain();
    expect(queue.size()).toBe(0);
  });
});
