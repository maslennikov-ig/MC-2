/**
 * Tests for the canonical Stage 6 lesson enqueue helper.
 *
 * Verifies that:
 * 1. enqueueStage6Lesson routes to the dedicated stage6-lesson-content queue
 * 2. All deduplication strategies (jobId, ttl) are correctly forwarded
 * 3. Source producer tag is logged
 * 4. Priority defaults and overrides work
 * 5. enqueueStage6Lessons batch helper works
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock BullMQ Queue ──
const mockAdd = vi.fn();
const mockOn = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function MockQueue() {
    return {
      add: mockAdd,
      on: mockOn,
    };
  }),
  Worker: vi.fn(),
}));

// ── Mock Redis client ──
vi.mock('@/shared/cache/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue({}),
}));

// ── Mock logger ──
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  enqueueStage6Lesson,
  enqueueStage6Lessons,
  type EnqueueStage6LessonOptions,
} from '@/stages/stage6-lesson-content/enqueue';
import type { Stage6JobInput } from '@/stages/stage6-lesson-content/types';
import { logger } from '@/shared/logger';

// ── Test fixtures ──

const baseJobData: Stage6JobInput = {
  lessonSpec: {
    lesson_id: '1.1',
    title: 'Test Lesson',
    sections: [],
  } as Stage6JobInput['lessonSpec'],
  courseId: 'course-uuid-123',
  language: 'en',
  ragChunks: [],
  ragContextId: null,
};

function makeOpts(overrides?: Partial<EnqueueStage6LessonOptions>): EnqueueStage6LessonOptions {
  return {
    jobData: baseJobData,
    jobName: 'lesson:1.1',
    source: 'partialGenerate',
    ...overrides,
  };
}

// ── Tests ──

describe('enqueueStage6Lesson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'mock-job-id' });
  });

  it('routes to the stage6-lesson-content queue (not course-generation)', async () => {
    await enqueueStage6Lesson(makeOpts());

    // The Queue constructor is called with the stage6 queue name
    const { Queue } = await import('bullmq');
    const constructorCalls = (Queue as unknown as ReturnType<typeof vi.fn>).mock.calls;
    // At least one call should have 'stage6-lesson-content' as first arg
    const queueNames = constructorCalls.map((c: unknown[]) => c[0]);
    expect(queueNames).toContain('stage6-lesson-content');
  });

  it('calls queue.add with correct job name and data', async () => {
    await enqueueStage6Lesson(makeOpts());

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'lesson:1.1',
      baseJobData,
      expect.objectContaining({ priority: 5 }) // default priority
    );
  });

  it('applies default priority of 5', async () => {
    await enqueueStage6Lesson(makeOpts());

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.priority).toBe(5);
  });

  it('overrides priority when specified', async () => {
    await enqueueStage6Lesson(makeOpts({ priority: 1 }));

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.priority).toBe(1);
  });

  // ── Deduplication: jobId strategy ──

  it('applies jobId deduplication for partialGenerate/startStage6/autoApproval', async () => {
    const dedupId = 'stage6:course-uuid-123:1.1';

    await enqueueStage6Lesson(
      makeOpts({
        deduplication: { kind: 'jobId', jobId: dedupId },
      })
    );

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.jobId).toBe(dedupId);
    expect(callOptions.deduplication).toBeUndefined();
  });

  // ── Deduplication: ttl strategy ──

  it('applies TTL deduplication for generateMissing/retryLesson', async () => {
    await enqueueStage6Lesson(
      makeOpts({
        source: 'generateMissing',
        deduplication: { kind: 'ttl', id: 'stage6:course:1.1', ttl: 150_000 },
      })
    );

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.deduplication).toEqual({
      id: 'stage6:course:1.1',
      ttl: 150_000,
    });
    expect(callOptions.jobId).toBeUndefined();
  });

  // ── No deduplication ──

  it('works without deduplication (admin triggers)', async () => {
    await enqueueStage6Lesson(
      makeOpts({
        source: 'adminTrigger',
        deduplication: undefined,
      })
    );

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.jobId).toBeUndefined();
    expect(callOptions.deduplication).toBeUndefined();
    expect(callOptions.priority).toBe(5);
  });

  // ── Extra job options ──

  it('merges extraJobOptions (last wins)', async () => {
    await enqueueStage6Lesson(
      makeOpts({
        priority: 3,
        extraJobOptions: { removeOnComplete: true },
      })
    );

    const callOptions = mockAdd.mock.calls[0][2];
    expect(callOptions.priority).toBe(3);
    expect(callOptions.removeOnComplete).toBe(true);
  });

  // ── Logging ──

  it('logs with source producer, queue name, and lesson metadata', async () => {
    await enqueueStage6Lesson(
      makeOpts({
        source: 'retryLesson',
        priority: 1,
      })
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'mock-job-id',
        jobName: 'lesson:1.1',
        queueName: 'stage6-lesson-content',
        source: 'retryLesson',
        priority: 1,
        courseId: 'course-uuid-123',
        lessonId: '1.1',
      }),
      expect.stringContaining('Stage 6 lesson enqueued [retryLesson]')
    );
  });

  it('returns the BullMQ Job', async () => {
    const job = await enqueueStage6Lesson(makeOpts());
    expect(job).toEqual({ id: 'mock-job-id' });
  });
});

// ── Batch helper ──

describe('enqueueStage6Lessons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'batch-job' });
  });

  it('enqueues multiple lessons in parallel', async () => {
    const opts: EnqueueStage6LessonOptions[] = [
      makeOpts({ jobName: 'lesson:1.1' }),
      makeOpts({ jobName: 'lesson:1.2' }),
      makeOpts({ jobName: 'lesson:2.1' }),
    ];

    const jobs = await enqueueStage6Lessons(opts);

    expect(jobs).toHaveLength(3);
    expect(mockAdd).toHaveBeenCalledTimes(3);
  });

  it('preserves order of results', async () => {
    let callIndex = 0;
    mockAdd.mockImplementation(() => {
      callIndex++;
      return Promise.resolve({ id: `job-${callIndex}` });
    });

    const opts: EnqueueStage6LessonOptions[] = [
      makeOpts({ jobName: 'lesson:1.1' }),
      makeOpts({ jobName: 'lesson:2.1' }),
    ];

    const jobs = await enqueueStage6Lessons(opts);

    expect(jobs[0].id).toBe('job-1');
    expect(jobs[1].id).toBe('job-2');
  });
});

// ── Producer source coverage ──

describe('all producer sources route through canonical helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'test-job' });
  });

  const producerSources = [
    'partialGenerate',
    'generateMissing',
    'retryLesson',
    'startStage6',
    'autoApproval',
    'adminTrigger',
    'adminRefinement',
  ] as const;

  for (const source of producerSources) {
    it(`accepts source="${source}" and logs it`, async () => {
      await enqueueStage6Lesson(makeOpts({ source }));

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ source }),
        expect.stringContaining(`[${source}]`)
      );
    });
  }
});
