/**
 * Contract: deleting a course removes every Redis key that names it.
 *
 * The patterns were anchored on an `idempotency:generation-` prefix, but the
 * course id sits in the middle of the keys Stage 4 and Stage 6 actually write,
 * and the Stage 4 phase-1 cache was not listed at all. The 2026-08-13 live run
 * left both behind on a course reported as fully cleaned (mc2-ufpko).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const COURSE_ID = '08912e3b-4010-4719-89c8-e9c8e19d133e';
const OTHER_COURSE_ID = '11111111-2222-4333-8444-555555555555';

/** Keys a live run leaves behind, plus keys belonging to another course. */
const LIVE_KEYS = [
  `phase1_cache:${COURSE_ID}`,
  `idempotency:worker-fallback-stage4-auto-${COURSE_ID}-stage4`,
  `idempotency:auto-${COURSE_ID}-stage6-lesson-l1`,
  `idempotency:generation-${COURSE_ID}-start`,
  `rag:${COURSE_ID}:section:1`,
  `doc_class:v2:${COURSE_ID}:doc-1`,
  `file_cache:${COURSE_ID}:file-1`,
  `lesson_md:${COURSE_ID}:l1`,
  `phase1_cache:${OTHER_COURSE_ID}`,
  `idempotency:auto-${OTHER_COURSE_ID}-stage6-lesson-l1`,
  `rag:${OTHER_COURSE_ID}:section:1`,
];

/** Minimal Redis stand-in: glob MATCH over an in-memory key set. */
function createFakeRedis(keys: string[]) {
  const store = new Set(keys);
  return {
    store,
    scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => {
      const expression = new RegExp(
        `^${pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*')}$`,
        'u'
      );
      return ['0', [...store].filter(key => expression.test(key))] as [string, string[]];
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
      return keys.length;
    }),
  };
}

let redis: ReturnType<typeof createFakeRedis>;

vi.mock('@/shared/cache/redis', () => ({
  getRedisClient: () => redis,
}));

describe('cleanupRedisForCourse', () => {
  beforeEach(() => {
    redis = createFakeRedis(LIVE_KEYS);
    vi.clearAllMocks();
  });

  it('removes every key naming the course, whatever the key shape', async () => {
    const { cleanupRedisForCourse } = await import('@/shared/cleanup/redis-cleanup');

    const result = await cleanupRedisForCourse(COURSE_ID);

    expect(result.success).toBe(true);
    expect([...redis.store].filter(key => key.includes(COURSE_ID))).toEqual([]);
  });

  it('leaves another course untouched', async () => {
    const { cleanupRedisForCourse } = await import('@/shared/cleanup/redis-cleanup');

    await cleanupRedisForCourse(COURSE_ID);

    expect([...redis.store].sort()).toEqual(
      [
        `phase1_cache:${OTHER_COURSE_ID}`,
        `idempotency:auto-${OTHER_COURSE_ID}-stage6-lesson-l1`,
        `rag:${OTHER_COURSE_ID}:section:1`,
      ].sort()
    );
  });
});
