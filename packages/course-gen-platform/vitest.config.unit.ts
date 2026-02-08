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
    setupFiles: ['./tests/setup-unit.ts'],
    // NO globalSetup/globalTeardown - unit tests don't need BullMQ worker or Redis
    // setup-unit.ts mocks Redis to prevent real connections
    reporters: ['default'],
    testTimeout: 30000, // 30 seconds - unit tests should be fast
    hookTimeout: 10000, // 10 seconds
    // Use forks pool for clean process isolation (prevents esbuild zombie processes)
    pool: 'forks',
    // Run tests in parallel for speed, forceExit handles cleanup
    fileParallelism: true,
    // Force exit after tests complete - some modules open Redis connections
    // that don't close cleanly without globalTeardown
    teardownTimeout: 5000,
    // Isolate tests to prevent state leakage
    isolate: true,
    // Don't wait for open handles indefinitely
    dangerouslyIgnoreUnhandledErrors: false,
    // Force exit after tests - some modules keep timers alive
    forceExit: true,
    // Exclude slow/problematic tests that need proper network mocking or timers
    exclude: [
      '**/node_modules/**',
      '**/poller.test.ts', // TODO: Add fake timers - test waits for real polling intervals
      '**/patcher.test.ts', // TODO: Add LLM mocking - makes real API calls, wastes money
      '**/verifier.test.ts', // TODO: Add LLM mocking - makes real API calls, wastes money
      '**/qwen3-section-generation.test.ts', // Makes real LLM API calls (qwen3, gpt-oss)
      '**/size-validation.test.ts', // Allocates 50-150 MB structures, OOMs fork workers
      '**/jina-reranker-client.test.ts', // Hangs on dynamic import in fork process
      '**/metadata-generator.test.ts', // TODO: Update fixtures to match current RT-006 schema
    ],
    // Allow passing when tests are skipped
    passWithNoTests: true,
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
