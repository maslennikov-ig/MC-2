/**
 * Root Vitest configuration — enables `pnpm vitest` from monorepo root.
 *
 * Uses the `projects` array (Vitest 4+) to discover per-package configs.
 * Each package defines its own vitest.config.ts that extends vitest.shared.ts.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
