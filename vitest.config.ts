import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@mis/core': path.resolve(import.meta.dirname, './packages/core/src'),
      '@mis/db': path.resolve(import.meta.dirname, './packages/db/src'),
      '@': path.resolve(import.meta.dirname, './apps/web/src'),
    },
  },
});
