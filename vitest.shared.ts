/**
 * Shared Vitest base configuration.
 *
 * All package-level vitest.config.ts files should use `mergeConfig()`
 * to extend this base with their own overrides.
 *
 * @example
 * import { mergeConfig, defineConfig } from 'vitest/config';
 * import sharedConfig from '../../vitest.shared';
 *
 * export default mergeConfig(sharedConfig, defineConfig({ ... }));
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    isolate: true,
    teardownTimeout: 5000,
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
    },
  },
});
