import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@mis/core': path.resolve(import.meta.dirname, './packages/core/src'),
      '@mis/db': path.resolve(import.meta.dirname, './packages/db/src'),
      '@': path.resolve(import.meta.dirname, './apps/web/src'),
    },
  },
});
