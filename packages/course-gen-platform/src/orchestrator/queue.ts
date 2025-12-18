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
 * This is used when restarting a stage to clean up any pending/active jobs
 * that might interfere with the restart.
 *
 * @param {string} courseId - The course ID to remove jobs for
 * @returns {Promise<{ removed: number; errors: number }>} Count of removed and failed removals
 *
 * @example
 * ```typescript
 * const result = await removeJobsByCourseId('course-uuid');
 * console.log(`Removed ${result.removed} jobs`);
 * ```
 */
export async function removeJobsByCourseId(
  courseId: string
): Promise<{ removed: number; errors: number }> {
  const queue = getQueue();
  let removed = 0;
  let errors = 0;

  try {
    // Get jobs from all states that might need cleanup
    const jobStates: Array<'active' | 'waiting' | 'delayed' | 'paused'> = ['active', 'waiting', 'delayed', 'paused'];
    const allJobs = await queue.getJobs(jobStates);

    // Filter jobs by courseId and remove them
    for (const job of allJobs) {
      if (job.data?.courseId === courseId) {
        try {
          // For active jobs, we can't remove them directly - they must complete or fail
          const state = await job.getState();
          if (state === 'active') {
            // Move to failed state to stop processing
            await job.moveToFailed(new Error('Job cancelled due to stage restart'), 'restart');
            removed++;
            logger.debug({
              jobId: job.id,
              jobType: job.name,
              courseId,
            }, 'Active job moved to failed for restart');
          } else {
            await job.remove();
            removed++;
            logger.debug({
              jobId: job.id,
              jobType: job.name,
              courseId,
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

    if (removed > 0 || errors > 0) {
      logger.info({
        courseId,
        removed,
        errors,
      }, 'Cleaned up jobs for course restart');
    }
  } catch (error) {
    logger.error({
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'Error cleaning up jobs for course');
    throw error;
  }

  return { removed, errors };
}

export default getQueue;
