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
  enqueueStage6CourseBatch,
  enqueueStage6Lesson,
  enqueueStage6Lessons,
  type EnqueueStage6LessonOptions,
} from '@/stages/stage6-lesson-content/enqueue';
import { isStage6BatchEnabled } from '@/stages/stage6-lesson-content/batch/config';
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

describe('enqueueStage6CourseBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockImplementation((name: string) =>
      Promise.resolve({ id: name.startsWith('course-batch:') ? 'coordinator-id' : `job:${name}` })
    );
  });

  it('creates delayed lesson fallbacks plus one coordinator and returns the ten lesson jobs', async () => {
    const opts = Array.from({ length: 10 }, (_, index) =>
      makeOpts({
        jobName: `lesson:2.${index + 1}`,
        jobData: {
          ...baseJobData,
          lessonSpec: {
            ...baseJobData.lessonSpec,
            lesson_id: `2.${index + 1}`,
          },
        },
        source: 'startStage6',
        deduplication: {
          kind: 'jobId',
          jobId: `stage6:course-uuid-123:2.${index + 1}`,
        },
      })
    );

    const result = await enqueueStage6CourseBatch(opts, { maxWaitMs: 7_200_000 });

    expect(result.lessonJobs).toHaveLength(10);
    expect(result.coordinatorJob.id).toBe('coordinator-id');
    expect(mockAdd).toHaveBeenCalledTimes(11);
    for (const call of mockAdd.mock.calls.slice(0, 10)) {
      expect(call[2]).toMatchObject({ delay: 7_200_000 });
    }
    const [name, data, options] = mockAdd.mock.calls[10];
    expect(name).toBe('course-batch:course-uuid-123');
    expect(data).toMatchObject({
      kind: 'stage6_batch_coordinator',
      courseId: 'course-uuid-123',
      state: null,
      lessonJobs: expect.arrayContaining([
        expect.objectContaining({ position: 0, lessonJobId: 'job:lesson:2.1' }),
      ]),
    });
    expect(data.lessonJobs).toHaveLength(10);
    expect(options).toMatchObject({ jobId: 'stage6-batch:course-uuid-123' });
  });
});

describe('Stage 6 Batch feature flag', () => {
  it('is disabled by default and only accepts the explicit true value', () => {
    const previous = process.env.FEATURE_STAGE6_BATCH_GENERATION;
    try {
      delete process.env.FEATURE_STAGE6_BATCH_GENERATION;
      expect(isStage6BatchEnabled()).toBe(false);
      process.env.FEATURE_STAGE6_BATCH_GENERATION = 'false';
      expect(isStage6BatchEnabled()).toBe(false);
      process.env.FEATURE_STAGE6_BATCH_GENERATION = 'true';
      expect(isStage6BatchEnabled()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.FEATURE_STAGE6_BATCH_GENERATION;
      else process.env.FEATURE_STAGE6_BATCH_GENERATION = previous;
    }
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
