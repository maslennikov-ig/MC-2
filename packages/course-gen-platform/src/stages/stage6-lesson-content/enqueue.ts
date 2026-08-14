/**
 * Canonical Stage 6 lesson enqueue helper
 * @module stages/stage6-lesson-content/enqueue
 *
 * Single entry point for all Stage 6 lesson content job enqueue operations.
 * All producers (partialGenerate, generateMissing, retryLesson, admin triggers,
 * startStage6, auto-approval) MUST use this helper instead of directly calling
 * queue.add() or addJob().
 *
 * Backend: dedicated `stage6-lesson-content` queue (env: BULLMQ_STAGE6_QUEUE_NAME)
 * Worker: 30 concurrent workers via createStage6Worker()
 */

import type { Job, JobsOptions } from 'bullmq';
import { createStage6Queue } from './factory';
import { HANDLER_CONFIG } from './config';
import type { Stage6JobInput, Stage6JobResult } from './types';
import { logger } from '@/shared/logger';
import type { Stage6BatchCoordinatorInput } from './batch/batch-processor';

// ── Source producer identifiers ──

export type Stage6ProducerSource =
  | 'partialGenerate'
  | 'generateMissing'
  | 'retryLesson'
  | 'startStage6'
  | 'autoApproval'
  | 'adminTrigger'
  | 'adminRefinement';

// ── Deduplication strategies ──

export interface Stage6DeduplicationJobId {
  kind: 'jobId';
  /** Deterministic jobId — BullMQ rejects duplicate add() calls with same jobId */
  jobId: string;
}

export interface Stage6DeduplicationTTL {
  kind: 'ttl';
  /** Deduplication key */
  id: string;
  /** TTL in ms (e.g. 150_000 = 2.5 min) */
  ttl: number;
}

export type Stage6Deduplication = Stage6DeduplicationJobId | Stage6DeduplicationTTL;

// ── Enqueue options ──

export interface EnqueueStage6LessonOptions {
  /** Job data for the Stage 6 worker */
  jobData: Stage6JobInput;
  /** Job name (appears in BullMQ dashboard), e.g. "lesson:1.3" */
  jobName: string;
  /** Producer source for logging/tracing */
  source: Stage6ProducerSource;
  /** Job priority (1 = highest, 10 = lowest). Default: 5 */
  priority?: number;
  /** Deduplication strategy */
  deduplication?: Stage6Deduplication;
  /** Additional BullMQ job options (merged last) */
  extraJobOptions?: Partial<JobsOptions>;
}

// ── Singleton queue instance ──

let _queue: ReturnType<typeof createStage6Queue> | null = null;

function getStage6Queue() {
  if (!_queue) {
    _queue = createStage6Queue();
  }
  return _queue;
}

/**
 * Enqueue a single Stage 6 lesson content job to the canonical
 * `stage6-lesson-content` queue.
 *
 * All Stage 6 producers MUST call this function instead of
 * `queue.add()` or `addJob(JobType.LESSON_CONTENT, ...)` directly.
 *
 * @returns The created BullMQ Job
 */
export async function enqueueStage6Lesson(
  opts: EnqueueStage6LessonOptions
): Promise<Job<Stage6JobInput, Stage6JobResult>> {
  const { jobData, jobName, source, priority = 5, deduplication, extraJobOptions } = opts;

  const queue = getStage6Queue();

  // Build BullMQ job options
  const jobOptions: JobsOptions = { priority };

  if (deduplication) {
    if (deduplication.kind === 'jobId') {
      jobOptions.jobId = deduplication.jobId;
    } else {
      jobOptions.deduplication = {
        id: deduplication.id,
        ttl: deduplication.ttl,
      };
    }
  }

  // Merge any extra options (last wins)
  if (extraJobOptions) {
    Object.assign(jobOptions, extraJobOptions);
  }

  const job = await queue.add(jobName, jobData, jobOptions);

  logger.info(
    {
      jobId: job.id,
      jobName,
      queueName: HANDLER_CONFIG.QUEUE_NAME,
      source,
      priority,
      courseId: jobData.courseId,
      lessonId: jobData.lessonSpec?.lesson_id,
      deduplicationKind: deduplication?.kind ?? 'none',
      organizationId: jobData.organizationId,
      userId: jobData.userId,
    },
    `Stage 6 lesson enqueued [${source}]`
  );

  return job;
}

/**
 * Enqueue multiple Stage 6 lesson jobs in parallel.
 *
 * Convenience wrapper over `enqueueStage6Lesson` for batch enqueue.
 * Returns jobs in the same order as the input options array.
 */
export async function enqueueStage6Lessons(
  optsList: EnqueueStage6LessonOptions[]
): Promise<Job<Stage6JobInput, Stage6JobResult>[]> {
  return Promise.all(optsList.map(enqueueStage6Lesson));
}

export interface EnqueueStage6CourseBatchResult {
  lessonJobs: Job<Stage6JobInput, Stage6JobResult>[];
  coordinatorJob: Job<Stage6BatchCoordinatorInput, Stage6JobResult>;
}

/**
 * Create delayed synchronous fallbacks for every lesson, then a coordinator
 * that may promote them early with prefetched Batch API responses.
 *
 * The delay is the reliability backstop: if the coordinator disappears, each
 * ordinary lesson job wakes by itself and follows the established sync path.
 */
export async function enqueueStage6CourseBatch(
  optsList: EnqueueStage6LessonOptions[],
  options: { maxWaitMs: number }
): Promise<EnqueueStage6CourseBatchResult> {
  if (optsList.length === 0) throw new Error('Stage 6 course batch must contain lessons');

  const courseId = optsList[0].jobData.courseId;
  const language = optsList[0].jobData.language;
  if (
    optsList.some(opts => opts.jobData.courseId !== courseId || opts.jobData.language !== language)
  ) {
    throw new Error('Stage 6 course batch lessons must share course and language');
  }

  const lessonJobs = await Promise.all(
    optsList.map(opts =>
      enqueueStage6Lesson({
        ...opts,
        extraJobOptions: {
          ...opts.extraJobOptions,
          delay: options.maxWaitMs,
        },
      })
    )
  );

  const coordinatorData: Stage6BatchCoordinatorInput = {
    kind: 'stage6_batch_coordinator',
    courseId,
    language,
    lessonJobs: lessonJobs.map((job, position) => {
      if (!job.id) throw new Error('Stage 6 delayed lesson job has no identifier');
      return {
        position,
        lessonJobId: job.id,
        jobData: optsList[position].jobData,
      };
    }),
    state: null,
  };

  const queue = getStage6Queue();
  const coordinatorQueue = queue as unknown as import('bullmq').Queue<
    Stage6BatchCoordinatorInput,
    Stage6JobResult
  >;
  const coordinatorJob = await coordinatorQueue.add(`course-batch:${courseId}`, coordinatorData, {
    jobId: `stage6-batch:${courseId}`,
    priority: Math.min(...optsList.map(opts => opts.priority ?? 5)),
  });

  logger.info(
    {
      courseId,
      coordinatorJobId: coordinatorJob.id,
      lessonCount: lessonJobs.length,
      maxWaitMs: options.maxWaitMs,
    },
    'Stage 6 Batch coordinator enqueued with delayed synchronous fallbacks'
  );

  return { lessonJobs, coordinatorJob };
}

/**
 * Get the canonical Stage 6 queue instance.
 * Exposed for operations that need direct queue access
 * (e.g. removeStaleJob, queue inspection).
 */
export { getStage6Queue };
