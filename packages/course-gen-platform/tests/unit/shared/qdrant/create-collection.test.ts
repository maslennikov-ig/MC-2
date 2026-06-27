import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';

const { mockGetCollections, mockLogger } = vi.hoisted(() => ({
  mockGetCollections: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    getCollections: mockGetCollections,
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

describe('qdrant create-collection module', () => {
  const originalArgv = [...process.argv];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetCollections.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it('does not run collection setup when imported by a different script with the same basename', async () => {
    process.argv = [originalArgv[0] ?? 'node', '/tmp/create-collection.ts'];

    await import('@/shared/qdrant/create-collection');

    expect(mockGetCollections).not.toHaveBeenCalled();
  });

  it('detects direct execution only when the full resolved path matches', async () => {
    process.argv = [originalArgv[0] ?? 'node', '/tmp/importer.ts'];

    const { isDirectExecution } = await import('@/shared/qdrant/create-collection');
    const moduleUrl = pathToFileURL('/repo/src/shared/qdrant/create-collection.ts').href;

    expect(isDirectExecution(moduleUrl, '/repo/src/shared/qdrant/create-collection.ts')).toBe(true);
    expect(isDirectExecution(moduleUrl, '/tmp/create-collection.ts')).toBe(false);
  });
});
