import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
