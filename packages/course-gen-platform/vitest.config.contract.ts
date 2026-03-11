import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

/**
 * Vitest config for CONTRACT tests only
 * - No globalSetup (contract tests verify API contracts, not job processing)
 * - Without globalSetup, BullMQ Worker is not started, avoiding the ESM
 *   main-worker.js resolution error (ERR_MODULE_NOT_FOUND for main-base)
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/contract/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts'],
      testTimeout: 120000,
      hookTimeout: 60000,
      teardownTimeout: 30000,
      fileParallelism: false,
      maxWorkers: 1,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@megacampusai/shared-types': path.resolve(__dirname, '../shared-types/src'),
        '@megacampus/shared-types': path.resolve(__dirname, '../shared-types/src'),
        '@repo/shared-types': path.resolve(__dirname, '../shared-types/src'),
      },
    },
  })
);
