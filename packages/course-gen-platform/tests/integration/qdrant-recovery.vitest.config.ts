import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';

const packageRoot = resolve(import.meta.dirname, '../..');

export default mergeConfig(
  sharedConfig,
  defineConfig({
    root: packageRoot,
    test: {
      include: ['tests/integration/qdrant-snapshot-restore.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 60_000,
      teardownTimeout: 30_000,
      fileParallelism: false,
      maxWorkers: 1,
    },
    resolve: {
      alias: {
        '@': resolve(packageRoot, 'src'),
        '@megacampusai/shared-types': resolve(packageRoot, '../shared-types/src'),
        '@megacampus/shared-types': resolve(packageRoot, '../shared-types/src'),
        '@repo/shared-types': resolve(packageRoot, '../shared-types/src'),
      },
    },
  })
);
