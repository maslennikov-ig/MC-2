/**
 * BullMQ Sandboxed Processor
 *
 * This module is executed in a separate Node.js process/worker thread
 * by BullMQ when using sandboxed processing mode. Running in a separate
 * process prevents job stalling issues when the main process is blocked.
 *
 * Benefits of sandboxed processing:
 * - Process isolation: crashes don't affect the main worker
 * - No stalled jobs from blocking code
 * - Better CPU utilization on multi-core systems
 * - Independent memory management per job
 *
 * @see https://docs.bullmq.io/guide/workers/sandboxed-processors
 * @module orchestrator/processor
 */

import { SandboxedJob } from 'bullmq';
import { JobData, JobType } from '@megacampus/shared-types';
import logger from '../shared/logger';
import { testJobHandler } from './handlers/test-handler';
import { initializeJobHandler } from './handlers/initialize';
import { documentProcessingHandler } from '../stages/stage2-document-processing/handler';
import { stage3ClassificationHandler } from '../stages/stage3-classification/handler';
import { stage4AnalysisHandler } from '../stages/stage4-analysis/handler';
import { stage5GenerationHandler } from '../stages/stage5-generation/handler';
import { processStage6Job } from '../stages/stage6-lesson-content/handler';
import type { JobResult } from './handlers/base-handler';

/**
 * Type for handler that can process either Job or SandboxedJob
 *
 * SandboxedJob has a subset of Job's properties and methods:
 * - data, id, name, opts, attemptsMade, timestamp, returnvalue
 * - updateProgress(), log(), updateData()
 *
 * Our handlers use the BaseJobHandler pattern which expects Job<T>,
 * but SandboxedJob is structurally compatible for the methods we use.
 */
type JobHandler = {
  process: (job: SandboxedJob<JobData>) => Promise<JobResult>;
};

/**
 * Job handler registry
 *
 * Maps job types to their corresponding handlers.
 * Handlers must be compatible with SandboxedJob interface.
 *
 * Note: In sandboxed mode, the Job type is replaced with SandboxedJob
 * which has a similar but reduced API. Our handlers are designed to
 * work with both types since they primarily use:
 * - job.data (available in both)
 * - job.id (available in both)
 * - job.name (available in both)
 * - job.updateProgress() (available in both)
 * - job.attemptsMade (available in both)
 * - job.opts (available in both)
 */
const jobHandlers: Record<string, JobHandler> = {
  [JobType.TEST_JOB]: testJobHandler as unknown as JobHandler,
  [JobType.INITIALIZE]: initializeJobHandler as unknown as JobHandler,
  [JobType.DOCUMENT_PROCESSING]: documentProcessingHandler as unknown as JobHandler,
  [JobType.DOCUMENT_CLASSIFICATION]: stage3ClassificationHandler as unknown as JobHandler,
  [JobType.STRUCTURE_ANALYSIS]: stage4AnalysisHandler as unknown as JobHandler,
  [JobType.STRUCTURE_GENERATION]: stage5GenerationHandler as unknown as JobHandler,
  [JobType.LESSON_CONTENT]: {
    process: async (job: SandboxedJob<JobData>) => {
      // Stage 6 handler expects token for pause/delay functionality
      // In sandboxed mode, the token is passed via job.token if available
      const token = (job as SandboxedJob<JobData> & { token?: string }).token;
      const result = await processStage6Job(job as any, token);
      return {
        success: result.success,
        message: result.success ? 'Lesson content generated' : result.errors.join(', '),
        data: result,
        error: result.errors.length > 0 ? result.errors[0] : undefined,
      };
    },
  },
};

/**
 * Process a job by routing it to the appropriate handler
 *
 * This function is the entry point for the sandboxed processor.
 * It routes jobs to the correct handler based on job.name (JobType).
 *
 * @param job - The SandboxedJob instance passed by BullMQ
 * @returns The job execution result
 * @throws Error if no handler is found for the job type
 */
async function processJob(job: SandboxedJob<JobData>): Promise<JobResult> {
  const jobType = job.name;

  // Validate job has a name - this can happen with corrupted jobs
  if (!jobType) {
    const error = 'Job has undefined name - likely corrupted or created without proper job type';
    logger.error(
      {
        jobId: job.id,
        jobData: job.data,
        availableHandlers: Object.keys(jobHandlers),
      },
      'Sandboxed processor: Job handler not found - job.name is undefined'
    );
    throw new Error(error);
  }

  const handler = jobHandlers[jobType];

  if (!handler) {
    const error = `No handler registered for job type: ${jobType}`;
    logger.error(
      {
        jobId: job.id,
        jobType,
        availableHandlers: Object.keys(jobHandlers),
      },
      'Sandboxed processor: Job handler not found'
    );
    throw new Error(error);
  }

  logger.debug(
    {
      jobId: job.id,
      jobType,
      attemptsMade: job.attemptsMade,
    },
    'Sandboxed processor: Starting job processing'
  );

  // Process the job using the handler
  const result = await handler.process(job);

  logger.debug(
    {
      jobId: job.id,
      jobType,
      success: result.success,
    },
    'Sandboxed processor: Job processing completed'
  );

  return result;
}

/**
 * Sandboxed processor entry point
 *
 * This is the default export that BullMQ will call for each job.
 * The function receives a SandboxedJob and must return the job result.
 *
 * Important notes for sandboxed processors:
 * 1. Each job runs in a separate process/thread
 * 2. State is not shared between jobs
 * 3. All imports must be resolvable from this file
 * 4. Process exit codes have special meaning (use sparingly)
 */
export default async function (job: SandboxedJob<JobData>): Promise<JobResult> {
  return processJob(job);
}
