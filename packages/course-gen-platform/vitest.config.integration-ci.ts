import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

/**
 * Fast CI integration smoke config.
 *
 * Full integration tests intentionally stay under `pnpm test:integration`.
 * This config is the deploy-gate subset: no BullMQ global worker, no full
 * document processing suite, and no broad live Supabase mutation sweep.
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: [
        'tests/integration/career-playbook-schema.test.ts',
        'tests/integration/document-evidence-observability-index.test.ts',
        'tests/integration/ci-qdrant-smoke.test.ts',
        'tests/integration/qdrant.test.ts',
      ],
      testTimeout: 30000,
      hookTimeout: 30000,
      teardownTimeout: 10000,
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
