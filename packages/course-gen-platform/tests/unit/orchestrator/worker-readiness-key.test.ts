/**
 * Contract: two environments do not see each other's worker readiness.
 *
 * Dev and production share one Redis instance with no database separation. The
 * queues are told apart by name; the readiness key was not, so `worker:readiness:status`
 * was one value for both and `generation.initiate` on dev could start a
 * generation on the strength of production's worker being up (mc2-43c75).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async () => true);
const get = vi.fn(async () => null);
vi.mock('@/shared/cache/redis', () => ({ cache: { set, get } }));

const originalQueueName = process.env.BULLMQ_QUEUE_NAME;

/** Loads the readiness module fresh under a given queue name. */
async function readinessKeyFor(queueName: string): Promise<string> {
  process.env.BULLMQ_QUEUE_NAME = queueName;
  vi.resetModules();
  set.mockClear();
  const module = await import('@/orchestrator/worker-readiness');
  await module.saveReadinessToRedis({
    ready: true,
    checks: [],
    startedAt: null,
    readyAt: null,
    lastCheckAt: new Date(0),
  });
  const [key] = set.mock.calls[0] as [string];
  return key;
}

describe('worker readiness key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalQueueName === undefined) delete process.env.BULLMQ_QUEUE_NAME;
    else process.env.BULLMQ_QUEUE_NAME = originalQueueName;
    vi.resetModules();
  });

  it('gives two queue names two different keys', async () => {
    const devKey = await readinessKeyFor('course-generation-dev');
    const productionKey = await readinessKeyFor('course-generation');

    expect(devKey).not.toBe(productionKey);
    expect(devKey).toContain('course-generation-dev');
    expect(productionKey).toContain('course-generation');
  });
});
