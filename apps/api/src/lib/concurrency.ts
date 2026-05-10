export function pLimit(limit: number) {
  if (limit < 1) throw new RangeError(`pLimit: limit must be >= 1, got ${limit}`);
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= limit) return;
    const job = queue.shift();
    if (job) {
      active += 1;
      job();
    }
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
  };
}
