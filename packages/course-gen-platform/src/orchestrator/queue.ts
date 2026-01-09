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

/**
 * Queue name for all course generation jobs
 */
export const QUEUE_NAME = 'course-generation';

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
  const defaultOptions = DEFAULT_JOB_OPTIONS[jobType];
  const options = customOptions ? { ...defaultOptions, ...customOptions } : defaultOptions;

  const job = await queue.add(jobType, jobData, options);

  logger.info({
    jobId: job.id,
    jobType,
    organizationId: jobData.organizationId,
    courseId: jobData.courseId,
  }, 'Job added to queue');

  return job;
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
    const jobStates: Array<'active' | 'waiting' | 'prioritized' | 'delayed' | 'paused'> = ['active', 'waiting', 'prioritized', 'delayed', 'paused'];
    const allJobs = await queue.getJobs(jobStates);

    // Filter jobs by courseId and remove them
    // Also clean up orphaned jobs with no data (they can't be processed anyway)
    for (const job of allJobs) {
      // Skip completely undefined jobs
      if (!job) continue;

      // Check if job has no data (orphaned/corrupted) or belongs to our course
      const isOrphanedJob = !job.data || !job.data.courseId;
      const belongsToCourse = job.data?.courseId === courseId;

      if (isOrphanedJob || belongsToCourse) {
        try {
          // For active jobs, we can't remove them directly - they must complete or fail
          const state = await job.getState();
          if (state === 'active') {
            // Move to failed state to stop processing
            const reason = isOrphanedJob
              ? 'Orphaned job with missing data'
              : 'Job cancelled due to course deletion';
            await job.moveToFailed(new Error(reason), 'cleanup');
            removed++;
            logger.debug({
              jobId: job.id,
              jobType: job.name,
              courseId: isOrphanedJob ? 'unknown' : courseId,
              reason: isOrphanedJob ? 'orphaned' : 'course_deletion',
            }, 'Active job moved to failed for cleanup');
          } else {
            await job.remove();
            removed++;
            logger.debug({
              jobId: job.id,
              jobType: job.name,
              courseId: isOrphanedJob ? 'unknown' : courseId,
              reason: isOrphanedJob ? 'orphaned' : 'course_deletion',
            }, 'Job removed from queue');
          }
        } catch (error) {
          errors++;
          logger.warn({
            jobId: job.id,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          }, 'Failed to remove job from queue');
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
        if (keyPart.includes(':') || ['meta', 'id', 'events', 'stalled-check', 'waiting', 'active', 'paused', 'completed', 'failed', 'delayed', 'prioritized'].includes(keyPart)) {
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

    // Phase 3: Clean up related Redis keys (lesson UUID mappings, etc.)
    const relatedPatterns = [
      `lesson:uuid:${courseId}:*`,
      `rag:${courseId}:*`,
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
      logger.info({
        courseId,
        removed,
        orphanedCleaned,
        errors,
      }, 'Cleaned up jobs and orphaned data for course');
    }
  } catch (error) {
    logger.error({
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'Error cleaning up jobs for course');
    throw error;
  }

  return { removed, errors, orphanedCleaned };
}

export default getQueue;
