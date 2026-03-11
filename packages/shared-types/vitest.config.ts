import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 30000,
      coverage: {
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.d.ts', 'src/database.types.ts'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  })
);
