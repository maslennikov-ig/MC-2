import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

// Codex Desktop can pass Windows TEMP/TMP paths through to WSL. Native Linux
// tools such as tsx cannot create Unix-domain sockets on that mounted drive,
// and permission-sensitive fixtures also cannot trust its directory modes.
// Set the standard Linux temp root before Vitest forks workers, while
// preserving any explicit TMPDIR supplied by the caller.
if (
  process.platform === 'linux' &&
  process.env.TMPDIR === undefined &&
  [process.env.TEMP, process.env.TMP].some(value => /^\/mnt\/[a-z]\//iu.test(value ?? ''))
) {
  process.env.TMPDIR = '/tmp';
}

/**
 * Vitest config for UNIT tests only
 * - No globalSetup (no BullMQ worker needed)
 * - Shorter timeouts (unit tests should be fast)
 * - Uses mocks instead of real services
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['./tests/setup-unit.ts'],
      testTimeout: 30000,
      hookTimeout: 10000,
      fileParallelism: true,
      // Q12 contract files launch real multi-process shell chains. Vitest's
      // CPU-count default runs too many of them together on large hosts and
      // makes otherwise sub-30s tests time out from contention.
      maxWorkers: 4,
      dangerouslyIgnoreUnhandledErrors: false,
      exclude: [
        '**/node_modules/**',
        '**/poller.test.ts',
        '**/patcher.test.ts',
        '**/verifier.test.ts',
        '**/qwen3-section-generation.test.ts',
        '**/size-validation.test.ts',
        '**/jina-reranker-client.test.ts',
        '**/metadata-generator.test.ts',
      ],
      coverage: {
        include: ['src/**/*.ts'],
        exclude: ['**/*.d.ts', '**/node_modules/**', 'src/build/**', 'src/types/**'],
      },
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
