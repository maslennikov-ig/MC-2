import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'], // Start worker once for all tests
    reporters: ['default', 'hanging-process'], // Diagnose process cleanup issues
    testTimeout: 1200000, // 20 minutes - increased for large PDF processing (Docling can take 5-10 min)
    hookTimeout: 60000,  // 1 minute - increased for setup/teardown
    fileParallelism: false, // Disable parallel execution to prevent test isolation issues
    pool: 'forks', // Use forks pool to properly close connections after tests
    poolOptions: {
      forks: {
        singleFork: true, // Use single fork for better resource cleanup
      },
    },
    // Note: BullMQ sourcemap warnings are cosmetic and don't affect tests
    // They occur because BullMQ ships .map files referencing source not in npm
    // See: https://github.com/vitest-dev/vitest/issues/7976
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
