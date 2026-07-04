/**
 * BullMQ Queue Configuration
 *
 * This module initializes and exports the main BullMQ queue for course generation jobs.
 * It handles Redis connection management and queue options configuration.
 *
 * @module orchestrator/queue
 */

import { Queue } from 'bullmq';
import { getRedisClient } from '../shared/cache/redis';
import { JobData, JobType, DEFAULT_JOB_OPTIONS } from '@megacampus/shared-types';
import logger from '../shared/logger';
import { getJobCourseId } from './job-data-fields';

/**
 * Queue name for all course generation jobs
 * Configurable via BULLMQ_QUEUE_NAME env variable for environment isolation (e.g., DEV vs production)
 */
export const QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME || 'course-generation';

/**
 * BullMQ Queue instance for course generation jobs
 *
 * This queue is configured with:
 * - Redis connection from REDIS_URL environment variable
 * - Default job options from shared-types (retry, backoff, timeouts)
 * - Connection sharing with existing Redis client
 */
let queue: Queue<JobData> | null = null;

/**
 * Get or create the BullMQ queue instance
 *
 * @returns {Queue<JobData>} The BullMQ queue instance
 *
 * @example
 * ```typescript
 * const queue = getQueue();
 * await queue.add('test_job', jobData);
 * ```
 */
export function getQueue(): Queue<JobData> {
  if (!queue) {
    const redisClient = getRedisClient();

    queue = new Queue<JobData>(QUEUE_NAME, {
      connection: redisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 86400, // 24 hours
          count: 100, // or last 100 jobs
        },
        removeOnFail: {
          age: 604800, // 7 days (for debugging)
          count: 50, // or last 50 failed jobs
        },
      },
    });

    logger.info({ queueName: QUEUE_NAME }, 'BullMQ queue initialized');

    // Handle queue errors
    queue.on('error', error => {
      logger.error({ err: error.message, queueName: QUEUE_NAME }, 'Queue error');
    });
  }

  return queue;
}

/**
 * Maximum job-level attempts for Career Playbook generation jobs.
 *
 * Career Playbook jobs run under a long processor TTL (up to 120 minutes via
 * CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS). When that hard TTL fires, the sandboxed
 * processor calls `process.exit()`, which BullMQ treats as a failed attempt. The
 * LangGraph pipeline has NO resumable checkpoint, so every retry restarts the
 * full, expensive generation from scratch — an observed 153-minute run cost ~3x.
 * Capping attempts at 1 prevents a single TTL kill from spawning further full
 * re-runs. The graph already performs per-phase internal retries, so genuine
 * transient sub-failures are still handled inside a single attempt. (mc2-1maah)
 */
export const CAREER_PLAYBOOK_MAX_ATTEMPTS = 1;

/**
 * Resolve the effective BullMQ job options for a job.
 *
 * Reproduces the historical merge of per-job-type defaults with caller overrides,
 * then applies the Career Playbook attempts cap. Extracted as a pure function so
 * the cost-critical attempts policy can be unit-tested without a Redis connection.
 *
 * Behavior for every non-CAREER_PLAYBOOK job type is byte-for-byte identical to
 * the previous inline merge.
 */
export function resolveJobOptions(
  jobType: JobType,
  customOptions?: import('bullmq').JobsOptions
): import('bullmq').JobsOptions {
  const defaultOptions = DEFAULT_JOB_OPTIONS[jobType];
  const merged = customOptions ? { ...defaultOptions, ...customOptions } : defaultOptions;

  if (jobType === JobType.CAREER_PLAYBOOK) {
    // Force the cap last so it wins over both the shared-types default (3) and
    // any caller-supplied attempts value.
    return { ...merged, attempts: CAREER_PLAYBOOK_MAX_ATTEMPTS };
  }

  return merged;
}

/**
 * Add a job to the queue with type-specific options
 *
 * @param {JobType} jobType - The type of job to add
 * @param {JobData} jobData - The job data payload
 * @param {import('bullmq').JobsOptions} [customOptions] - Optional custom job options (e.g., jobId for test isolation)
 * @returns {Promise<import('bullmq').Job<JobData>>} The created job
 *
 * @example
 * ```typescript
 * const job = await addJob(JobType.TEST_JOB, {
 *   jobType: JobType.TEST_JOB,
 *   organizationId: '...',
 *   courseId: '...',
 *   userId: '...',
 *   message: 'Hello',
 *   createdAt: new Date().toISOString(),
 * });
 *
 * // With custom jobId for test isolation
 * const job = await addJob(JobType.TEST_JOB, jobData, { jobId: 'test-suite-1-job-1' });
 * ```
 */
export async function addJob(
  jobType: JobType,
  jobData: JobData,
  customOptions?: import('bullmq').JobsOptions
) {
  const queue = getQueue();
  const options = resolveJobOptions(jobType, customOptions);

  const job = await queue.add(jobType, jobData, options);

  logger.info(
    {
      jobId: job.id,
      jobType,
      organizationId: jobData.organizationId,
      courseId: getJobCourseId(jobData),
    },
    'Job added to queue'
  );

  return job;
}

export async function removeTerminalJobById(jobId: string): Promise<boolean> {
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state !== 'completed' && state !== 'failed') return false;

  await job.remove();
  logger.info({ jobId, state }, 'Removed stale terminal job before enqueue');
  return true;
}

/**
 * Close the queue connection gracefully
 *
 * @returns {Promise<void>}
 */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
    logger.info('Queue closed');
  }
}

/**
 * Remove all jobs for a specific course from the queue
 *
 * This is used when restarting a stage or deleting a course to clean up
 * any pending/active jobs that might interfere.
 *
 * Cleans up:
 * 1. Jobs in queue states (active, waiting, prioritized, delayed, paused)
 * 2. Orphaned job hash keys in Redis (jobs that left queues but data remains)
 *
 * @param {string} courseId - The course ID to remove jobs for
 * @returns {Promise<{ removed: number; errors: number; orphanedCleaned: number }>} Cleanup stats
 *
 * @example
 * ```typescript
 * const result = await removeJobsByCourseId('course-uuid');
 * console.log(`Removed ${result.removed} jobs, cleaned ${result.orphanedCleaned} orphaned`);
 * ```
 */
export async function removeJobsByCourseId(
  courseId: string
): Promise<{ removed: number; errors: number; orphanedCleaned: number }> {
  const queue = getQueue();
  const redis = getRedisClient();
  let removed = 0;
  let errors = 0;
  let orphanedCleaned = 0;

  try {
    // Phase 1: Remove jobs from queue states
    // Note: 'prioritized' is separate from 'waiting' in BullMQ for jobs with priority
    const jobStates: Array<'active' | 'waiting' | 'prioritized' | 'delayed' | 'paused'> = [
      'active',
      'waiting',
      'prioritized',
      'delayed',
      'paused',
    ];
    const allJobs = await queue.getJobs(jobStates);

    // Filter jobs by courseId and remove them
    // Also clean up orphaned jobs with no data (they can't be processed anyway)
    for (const job of allJobs) {
      // Skip completely undefined jobs
      if (!job) continue;

      // Check if job has no data (orphaned/corrupted) or belongs to our course
      // Support both camelCase and snake_case (some jobs use snake_case internally)
      const jobData = job.data as Record<string, unknown> | undefined;
      const cleanupDecision = shouldRemoveJobForCourseCleanup(jobData, courseId);

      if (cleanupDecision.remove) {
        try {
          // For active jobs, we can't remove them directly - they must complete or fail
          const state = await job.getState();
          if (state === 'active') {
            // Move to failed state to stop processing
            const reason =
              cleanupDecision.reason === 'orphaned'
                ? 'Orphaned job with missing data'
                : 'Job cancelled due to course deletion';
            await job.moveToFailed(new Error(reason), 'cleanup');
            removed++;
            logger.debug(
              {
                jobId: job.id,
                jobType: job.name,
                courseId: cleanupDecision.reason === 'orphaned' ? 'unknown' : courseId,
                reason: cleanupDecision.reason,
              },
              'Active job moved to failed for cleanup'
            );
          } else {
            await job.remove();
            removed++;
            logger.debug(
              {
                jobId: job.id,
                jobType: job.name,
                courseId: cleanupDecision.reason === 'orphaned' ? 'unknown' : courseId,
                reason: cleanupDecision.reason,
              },
              'Job removed from queue'
            );
          }
        } catch (error) {
          errors++;
          logger.warn(
            {
              jobId: job.id,
              courseId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to remove job from queue'
          );
        }
      }
    }

    // Phase 2: Clean up orphaned job hash keys
    // These are job data hashes that remain in Redis after jobs leave queues
    // Pattern: bull:course-generation:* (where * is job ID)
    const keyPattern = `bull:${QUEUE_NAME}:*`;
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      // Use SCAN to iterate through keys without blocking Redis
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', keyPattern, 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        // Skip non-job keys (meta, events, etc.)
        const keyPart = key.replace(`bull:${QUEUE_NAME}:`, '');
        if (
          keyPart.includes(':') ||
          [
            'meta',
            'id',
            'events',
            'stalled-check',
            'waiting',
            'active',
            'paused',
            'completed',
            'failed',
            'delayed',
            'prioritized',
          ].includes(keyPart)
        ) {
          continue;
        }

        try {
          // Check if this hash contains our courseId
          const data = await redis.hget(key, 'data');
          if (data && data.includes(courseId)) {
            keysToDelete.push(key);
          }
        } catch {
          // Ignore errors reading individual keys
        }
      }
    } while (cursor !== '0');

    // Delete orphaned keys
    if (keysToDelete.length > 0) {
      for (const key of keysToDelete) {
        try {
          await redis.del(key);
          orphanedCleaned++;
        } catch {
          errors++;
        }
      }
    }

    // Phase 3: Clean up related Redis keys (lesson UUID mappings, generation locks, etc.)
    const relatedPatterns = [
      `lesson:uuid:${courseId}:*`,
      `rag:${courseId}:*`,
      `generation:lock:${courseId}`,
    ];

    for (const pattern of relatedPatterns) {
      let relatedCursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(relatedCursor, 'MATCH', pattern, 'COUNT', 100);
        relatedCursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          orphanedCleaned += keys.length;
        }
      } while (relatedCursor !== '0');
    }

    if (removed > 0 || errors > 0 || orphanedCleaned > 0) {
      logger.info(
        {
          courseId,
          removed,
          orphanedCleaned,
          errors,
        },
        'Cleaned up jobs and orphaned data for course'
      );
    }
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error cleaning up jobs for course'
    );
    throw error;
  }

  return { removed, errors, orphanedCleaned };
}

export function shouldRemoveJobForCourseCleanup(
  jobData: Record<string, unknown> | undefined,
  courseId: string
): { remove: boolean; reason: 'course_deletion' | 'orphaned' | 'non_course_job' | 'unrelated' } {
  if (!jobData) return { remove: true, reason: 'orphaned' };

  const jobCourseId = (jobData.courseId || jobData.course_id) as string | undefined;
  if (jobCourseId) {
    return jobCourseId === courseId
      ? { remove: true, reason: 'course_deletion' }
      : { remove: false, reason: 'unrelated' };
  }

  if (jobData.jobType === JobType.CAREER_PLAYBOOK) {
    return { remove: false, reason: 'non_course_job' };
  }

  return { remove: true, reason: 'orphaned' };
}

export default getQueue;
