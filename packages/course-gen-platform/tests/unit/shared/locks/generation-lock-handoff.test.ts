/**
 * Contract: a stage lets go of the course before it hands it to the next one.
 *
 * Stage 4 queued Stage 5 while still holding the generation lock and only
 * released it in its `finally`. A worker picks the next job up at once, and a
 * lock conflict is retried with no delay, so all three attempts were spent
 * inside two seconds against a lock with ninety seconds left to live. The
 * course was marked failed for a reason that would have cleared itself
 * (mc2-2pplo, 2026-08-15). It is a race, so it struck one live run and spared
 * the one before it.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireLock: vi.fn(async () => ({ acquired: true })),
  releaseLock: vi.fn(async () => true),
  extendLock: vi.fn(async () => true),
}));
const { acquireLock, releaseLock } = mocks;

vi.mock('@/shared/locks/generation-lock', () => ({
  generationLockService: mocks,
}));

import { acquireGenerationLock } from '@/shared/locks/generation-lock-helper';

const logger = {
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
} as never;

describe('generation lock handoff', () => {
  beforeEach(() => {
    acquireLock.mockClear();
    releaseLock.mockClear();
  });

  it('releases the lock once, however many times it is asked to', async () => {
    const guard = await acquireGenerationLock('course-1', 'stage-4-job-1', logger);

    // Once before queueing the next stage, once again from the `finally`.
    await guard.release();
    await guard.release();

    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith('course-1', 'stage-4-job-1');
  });

  it('leaves the course unlocked for the next stage to claim', async () => {
    const guard = await acquireGenerationLock('course-1', 'stage-4-job-1', logger);
    await guard.release();

    // What Stage 5 does a moment later.
    const next = await acquireGenerationLock('course-1', 'stage-5-job-1', logger);

    expect(next.lockId).toBe('stage-5-job-1');
    expect(acquireLock).toHaveBeenLastCalledWith('course-1', 'stage-5-job-1');
    await next.release();
  });

  it('still reports a lock it could not take', async () => {
    acquireLock.mockResolvedValueOnce({
      acquired: false,
      reason: 'Lock held by stage-4-job-1',
    } as never);

    await expect(acquireGenerationLock('course-1', 'stage-5-job-1', logger)).rejects.toThrow(
      /already being processed/
    );
  });
});
