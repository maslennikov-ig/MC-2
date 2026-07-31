import { describe, expect, it, vi } from 'vitest';

import { finalizeReindexCliProcess } from '../../../../tools/qdrant/reindex-course-embeddings';

// MEASURED 2026-07-31 on megacampus-prod. Four qdrant-operator containers were still Up hours
// after their `reindex execute` and `reindex verify` runs had printed their results and closed
// their own queue — one for seven hours. The operator services run with `--rm`, which only fires
// when the container STOPS, so every run leaked a container that held a Redis connection open.
//
// Setting process.exitCode is not enough: the process exits when the event loop drains, and the
// loop was being held by handles this CLI does not own (the shared Redis cache client the hybrid
// search path connects, HTTP agents). A one-shot CLI that has finished its work and reported it
// must bring the process down itself — after flushing, because container stdout is a pipe and a
// bare process.exit() truncates it.
describe('finalizeReindexCliProcess', () => {
  function harness(overrides: Partial<Parameters<typeof finalizeReindexCliProcess>[0]> = {}) {
    const order: string[] = [];
    return {
      order,
      options: {
        exitCode: 0,
        closeQueue: vi.fn(async () => {
          order.push('close');
        }),
        flushStdout: vi.fn(async () => {
          order.push('flush');
        }),
        exit: vi.fn((code: number) => {
          order.push(`exit:${code}`);
        }),
        ...overrides,
      },
    };
  }

  it('closes the queue, flushes, and only then brings the process down', async () => {
    const { order, options } = harness();

    await finalizeReindexCliProcess(options);

    expect(order).toEqual(['close', 'flush', 'exit:0']);
  });

  it('carries the failing exit code through', async () => {
    const { options } = harness({ exitCode: 1 });

    await finalizeReindexCliProcess(options);

    expect(options.exit).toHaveBeenCalledWith(1);
  });

  it('still exits when closing the queue throws, or the container leaks anyway', async () => {
    const { order, options } = harness({
      closeQueue: vi.fn(async () => {
        throw new Error('redis gone');
      }),
    });

    await finalizeReindexCliProcess(options);

    expect(order).toEqual(['flush', 'exit:0']);
  });

  it('still exits when the flush itself fails', async () => {
    const { options } = harness({
      exitCode: 2,
      flushStdout: vi.fn(async () => {
        throw new Error('EPIPE');
      }),
    });

    await finalizeReindexCliProcess(options);

    expect(options.exit).toHaveBeenCalledWith(2);
  });
});
