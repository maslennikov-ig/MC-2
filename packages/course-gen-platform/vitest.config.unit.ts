import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for UNIT tests only
 * - No globalSetup (no BullMQ worker needed)
 * - Shorter timeouts (unit tests should be fast)
 * - Uses mocks instead of real services
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // NO globalSetup - unit tests don't need BullMQ worker
    globalSetup: ['./tests/global-teardown-unit.ts'], // Only teardown, closes Redis
    reporters: ['default'],
    testTimeout: 30000, // 30 seconds - unit tests should be fast
    hookTimeout: 10000, // 10 seconds
    fileParallelism: true, // Unit tests can run in parallel
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Allow parallel forks for speed
      },
    },
    // Force exit after tests complete - some modules open Redis connections
    // that don't close cleanly without globalTeardown
    teardownTimeout: 5000,
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
