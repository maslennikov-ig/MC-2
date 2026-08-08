import { afterEach, describe, expect, it, vi } from 'vitest';
import { QDRANT_TEST_SETUP_OPT_OUT, runGlobalSetup, runGlobalTeardown } from '../global-setup';

vi.mock('../../src/orchestrator/worker.js', () => ({
  startWorker: vi.fn(),
  stopWorker: vi.fn(),
}));
vi.mock('../../src/shared/cache/redis.js', () => ({
  closeRedisClient: vi.fn(),
}));
vi.mock('../../src/shared/qdrant/create-collection.js', () => ({
  createCourseEmbeddingsCollection: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runGlobalSetup', () => {
  function dependencies() {
    return {
      createCourseEmbeddingsCollection: vi.fn().mockResolvedValue(undefined),
      startWorker: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('keeps Qdrant bootstrap strict by default', async () => {
    const deps = dependencies();
    deps.createCourseEmbeddingsCollection.mockRejectedValue(new Error('Qdrant unavailable'));

    await expect(runGlobalSetup(deps, {})).rejects.toThrow('Qdrant unavailable');
    expect(deps.startWorker).not.toHaveBeenCalled();
  });

  it(`skips only Qdrant bootstrap when ${QDRANT_TEST_SETUP_OPT_OUT}=1`, async () => {
    const deps = dependencies();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await runGlobalSetup(deps, { [QDRANT_TEST_SETUP_OPT_OUT]: '1' });

    expect(deps.createCourseEmbeddingsCollection).not.toHaveBeenCalled();
    expect(deps.startWorker).toHaveBeenCalledWith(5);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(QDRANT_TEST_SETUP_OPT_OUT));
  });

  it.each(['true', 'yes', '0', ''])(
    'does not accept %j as an implicit Qdrant opt-out',
    async value => {
      const deps = dependencies();

      await runGlobalSetup(deps, { [QDRANT_TEST_SETUP_OPT_OUT]: value });

      expect(deps.createCourseEmbeddingsCollection).toHaveBeenCalledOnce();
      expect(deps.startWorker).toHaveBeenCalledWith(5);
    }
  );
});

describe('runGlobalTeardown', () => {
  it.each(['worker', 'redis'] as const)(
    'forces a nonzero exit when %s cleanup fails',
    async owner => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const exit = vi.fn((code: number): never => {
        throw new Error(`synthetic exit ${code}`);
      });

      await expect(
        runGlobalTeardown({
          stopWorker:
            owner === 'worker'
              ? vi.fn().mockRejectedValue(new Error('worker cleanup failed'))
              : vi.fn().mockResolvedValue(undefined),
          closeRedisClient:
            owner === 'redis'
              ? vi.fn().mockRejectedValue(new Error('redis cleanup failed'))
              : vi.fn().mockResolvedValue(undefined),
          sleep: vi.fn().mockResolvedValue(undefined),
          exit,
        })
      ).rejects.toThrow('synthetic exit 1');

      expect(exit).toHaveBeenCalledWith(1);
    }
  );
});
