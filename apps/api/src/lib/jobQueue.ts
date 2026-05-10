import { logger } from './logger';

export type Job<T = void> = () => Promise<T>;

export interface JobQueue {
  enqueue<T>(label: string, job: Job<T>): Promise<T>;
  /** Resolve when no jobs are running or queued. Useful for tests. */
  drain(): Promise<void>;
  size(): number;
}

interface QueuedItem {
  label: string;
  run: () => Promise<void>;
}

export function createJobQueue(opts: { concurrency?: number } = {}): JobQueue {
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const queue: QueuedItem[] = [];
  let active = 0;
  const idleWaiters: Array<() => void> = [];

  function pump(): void {
    while (active < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      active += 1;
      item
        .run()
        .catch((err) => {
          logger.error({ err, label: item.label }, 'job queue: uncaught task error');
        })
        .finally(() => {
          active -= 1;
          if (active === 0 && queue.length === 0) {
            while (idleWaiters.length > 0) idleWaiters.shift()!();
          } else {
            pump();
          }
        });
    }
  }

  return {
    enqueue<T>(label: string, job: Job<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          label,
          run: () => job().then(resolve, reject),
        });
        pump();
      });
    },
    drain(): Promise<void> {
      if (active === 0 && queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    size(): number {
      return queue.length + active;
    },
  };
}
