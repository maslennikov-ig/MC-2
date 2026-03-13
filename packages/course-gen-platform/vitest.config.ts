import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

/**
 * Vitest config for INTEGRATION tests (full pipeline with real services).
 * - globalSetup starts BullMQ worker
 * - Longer timeouts for PDF processing & LLM calls
 * - Single fork for resource cleanup
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts'],
      globalSetup: ['./tests/global-setup.ts'],
      reporters: ['default', 'hanging-process'],
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
