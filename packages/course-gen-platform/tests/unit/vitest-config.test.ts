import { describe, expect, it } from 'vitest';
import integrationConfig, { isQdrantOnlyIntegrationSelection } from '../../vitest.config';

const PACKAGE_ROOT = '/repo/packages/course-gen-platform';
const QDRANT_TEST = 'tests/integration/qdrant.test.ts';

describe('isQdrantOnlyIntegrationSelection', () => {
  it.each([
    QDRANT_TEST,
    `./${QDRANT_TEST}`,
    `packages/course-gen-platform/${QDRANT_TEST}`,
    `${PACKAGE_ROOT}/${QDRANT_TEST}`,
  ])('accepts the exact normalized Qdrant selection %s', selection => {
    expect(
      isQdrantOnlyIntegrationSelection(['node', 'vitest', 'run', selection], PACKAGE_ROOT)
    ).toBe(true);
  });

  it.each([
    { argv: ['node', 'vitest', 'run'] },
    { argv: ['node', 'vitest', 'run', 'tests/integration'] },
    { argv: ['node', 'vitest', 'run', 'tests/integration/ci-qdrant-smoke.test.ts'] },
    {
      argv: ['node', 'vitest', 'run', QDRANT_TEST, 'tests/integration/other.test.ts'],
    },
    { argv: ['node', 'vitest', 'run', QDRANT_TEST, 'outside-package.test.ts'] },
    { argv: ['node', 'vitest', 'run', '--config', QDRANT_TEST] },
  ])('keeps default setup for argv $argv', ({ argv }) => {
    expect(isQdrantOnlyIntegrationSelection(argv, PACKAGE_ROOT)).toBe(false);
  });

  it('ignores non-test option values while recognizing the one test selection', () => {
    expect(
      isQdrantOnlyIntegrationSelection(
        ['node', 'vitest', 'run', '--reporter', 'default', QDRANT_TEST],
        PACKAGE_ROOT
      )
    ).toBe(true);
  });

  it('keeps the normal setup and BullMQ global setup in the default configuration', () => {
    expect(integrationConfig.test?.setupFiles).toEqual(['./tests/setup.ts']);
    expect(integrationConfig.test?.globalSetup).toEqual(['./tests/global-setup.ts']);
  });
});
