import { mergeConfig, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import sharedConfig from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    // tsconfig.json says `"jsx": "preserve"` because Next.js compiles JSX itself.
    // Vite 8 transforms with oxc instead of esbuild, and oxc honours that tsconfig
    // field, so every .tsx reached rolldown's SSR re-parse with its JSX intact and
    // died on `Unexpected JSX expression` — 47 of 93 test files, none of them a
    // failing assertion. @vitejs/plugin-react does set `esbuild.jsx: 'automatic'`,
    // but vite 8 ignores esbuild options entirely and only says so in a startup
    // warning. Compile JSX here, for tests alone; the Next build is untouched.
    oxc: {
      jsx: 'react-jsx',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      include: [
        'tests/unit/**/*.test.{ts,tsx}',
        'tests/integration/**/*.test.{ts,tsx}',
        'lib/**/__tests__/**/*.test.{ts,tsx}',
        'components/**/__tests__/**/*.test.{ts,tsx}',
      ],
      exclude: [
        'node_modules',
        '.next',
        'tests/e2e/**',
        'tests/playwright/**',
        'tests/performance/**',
        'tests/accessibility/**',
      ],
      coverage: {
        include: [
          'app/**/*.{js,jsx,ts,tsx}',
          'components/**/*.{js,jsx,ts,tsx}',
          'lib/**/*.{js,jsx,ts,tsx}',
        ],
        exclude: [
          '**/*.d.ts',
          '**/node_modules/**',
          '**/.next/**',
          '**/coverage/**',
          '**/tests/**',
          '**/*.config.js',
          '**/*.config.ts',
        ],
        thresholds: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  })
)
