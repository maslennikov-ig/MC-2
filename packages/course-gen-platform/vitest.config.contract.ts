import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for CONTRACT tests only
 * - No globalSetup (contract tests verify API contracts, not job processing)
 * - Without globalSetup, BullMQ Worker is not started, avoiding the ESM
 *   main-worker.js resolution error (ERR_MODULE_NOT_FOUND for main-base)
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/contract/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    reporters: ['default'],
    testTimeout: 120000, // 2 minutes - contract tests call real Supabase
    hookTimeout: 60000, // 1 minute for setup/teardown
    teardownTimeout: 30000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    forceExit: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@megacampusai/shared-types': path.resolve(__dirname, '../shared-types/src'),
      '@megacampus/shared-types': path.resolve(__dirname, '../shared-types/src'),
      '@repo/shared-types': path.resolve(__dirname, '../shared-types/src'),
    },
  },
});
