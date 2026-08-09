import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'path';
import sharedConfig from '../../vitest.shared';

const QDRANT_INTEGRATION_TEST = 'tests/integration/qdrant.test.ts';
const PACKAGE_RELATIVE_PREFIX = 'packages/course-gen-platform/';
const OPTIONS_WITH_SEPARATE_VALUES = new Set([
  '--config',
  '-c',
  '--dir',
  '--environment',
  '--outputFile',
  '--project',
  '--reporter',
  '--root',
  '--workspace',
]);

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function packageTestSelection(argument: string, packageRoot: string): string | null {
  if (argument.startsWith('-')) return null;

  const normalized = normalizeSlashes(argument);
  if (normalized.startsWith(PACKAGE_RELATIVE_PREFIX)) {
    return normalized.slice(PACKAGE_RELATIVE_PREFIX.length);
  }
  if (normalized.startsWith('tests/')) return normalized;
  if (!path.isAbsolute(argument)) return null;

  const relative = normalizeSlashes(path.relative(packageRoot, argument));
  return relative.startsWith('tests/') ? relative : null;
}

/** True only for an explicit one-file Qdrant integration CLI selection. */
export function isQdrantOnlyIntegrationSelection(
  argv: readonly string[],
  packageRoot: string = __dirname
): boolean {
  const runIndex = argv.lastIndexOf('run');
  if (runIndex === -1) return false;

  const selections: string[] = [];
  let skipOptionValue = false;

  for (const argument of argv.slice(runIndex + 1)) {
    if (skipOptionValue) {
      skipOptionValue = false;
      continue;
    }
    if (OPTIONS_WITH_SEPARATE_VALUES.has(argument)) {
      skipOptionValue = true;
      continue;
    }

    const selection = packageTestSelection(argument, packageRoot);
    if (selection === null) {
      if (!argument.startsWith('-')) return false;
      continue;
    }
    selections.push(selection);
  }

  return selections.length === 1 && selections[0] === QDRANT_INTEGRATION_TEST;
}

const qdrantOnlyIntegration = isQdrantOnlyIntegrationSelection(process.argv);

/**
 * Vitest config for INTEGRATION tests (full pipeline with real services).
 * - globalSetup starts BullMQ worker
 * - Longer timeouts for PDF processing & LLM calls
 * - Single fork for resource cleanup
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      passWithNoTests: false,
      setupFiles: qdrantOnlyIntegration ? [] : ['./tests/setup.ts'],
      globalSetup: qdrantOnlyIntegration ? [] : ['./tests/global-setup.ts'],
      reporters: ['default', 'hanging-process'],
      testTimeout: 120000,
      hookTimeout: 60000,
      teardownTimeout: 30000,
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
