import { mergeConfig, defineConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 30000,
      coverage: {
        include: ['src/**/*.ts'],
      },
    },
  })
);
