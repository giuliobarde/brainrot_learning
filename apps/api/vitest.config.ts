import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    isolate: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
