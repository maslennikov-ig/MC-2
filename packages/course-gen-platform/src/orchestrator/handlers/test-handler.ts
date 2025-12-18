/**
 * Test Job Handler
 *
 * Handler for test jobs used to validate the BullMQ orchestration system.
 * Supports configurable delays and intentional failures for testing error handling.
 *
 * @module orchestrator/handlers/test-handler
 */

 

import { Job } from 'bullmq';
import { TestJobData, JobType } from '@megacampus/shared-types';
import { BaseJobHandler, JobResult } from './base-handler';

/**
 * Test job handler
 *
 * Processes test jobs with the following features:
 * - Logs test message
 * - Optional delay for testing async operations
 * - Optional failure for testing error handling
 * - Progress updates during execution
 *
 * @extends BaseJobHandler<TestJobData>
 */
export class TestJobHandler extends BaseJobHandler<TestJobData> {
  constructor() {
    super(JobType.TEST_JOB);
  }

  /**
   * Execute test job
   *
   * @param {TestJobData} jobData - Test job data
   * @param {Job<TestJobData>} job - BullMQ job instance
   * @returns {Promise<JobResult>} Job execution result
   */
  async execute(jobData: TestJobData, job: Job<TestJobData>): Promise<JobResult> {
    // Add minimum delay to prevent BullMQ lock race conditions in fast-executing jobs
    // This ensures jobs don't complete before BullMQ can properly manage locks
    const MIN_DELAY_MS = 50;
    const effectiveDelay = jobData.delayMs ?? MIN_DELAY_MS;

    this.log(job, 'info', 'Processing test job', {
      message: jobData.message,
      delayMs: effectiveDelay,
      shouldFail: jobData.shouldFail,
      checkCancellation: jobData.checkCancellation,
    });

    // Update progress to 25%
    await this.updateProgress(job, 25, 'Starting test job');

    // Simulate work with delay (minimum 50ms to avoid race conditions)
    if (effectiveDelay > 0) {
      this.log(job, 'debug', `Simulating work with ${effectiveDelay}ms delay`);

      if (jobData.checkCancellation) {
        // Check for cancellation periodically during the delay
        const checkInterval = 500; // Check every 500ms
        const iterations = Math.floor(effectiveDelay / checkInterval);
        const remainingMs = effectiveDelay % checkInterval;

        for (let i = 0; i < iterations; i++) {
          await this.checkCancellation(job);
          await new Promise(resolve => setTimeout(resolve, checkInterval));

          // Update progress from 25% to 75% during the delay
          const progress = 25 + Math.floor((i / iterations) * 50);
          await this.updateProgress(job, progress, `Processing (${i + 1}/${iterations})`);
        }

        // Handle remaining milliseconds
        if (remainingMs > 0) {
          await this.checkCancellation(job);
          await new Promise(resolve => setTimeout(resolve, remainingMs));
        }
      } else {
        // Break the delay into chunks for progress updates
        const chunks = Math.min(10, Math.ceil(effectiveDelay / 100));
        const chunkDelay = effectiveDelay / chunks;

        for (let i = 0; i < chunks; i++) {
          if (await this.isCancelled(job)) {
            this.log(job, 'warn', 'Test job was cancelled');
            return {
              success: false,
              message: 'Job was cancelled',
            };
          }

          await new Promise(resolve => setTimeout(resolve, chunkDelay));

          // Update progress from 25% to 75% during the delay
          const progress = 25 + Math.floor((i / chunks) * 50);
          await this.updateProgress(job, progress, `Processing (${i + 1}/${chunks})`);
        }
      }
    }

    // Update progress to 75%
    await this.updateProgress(job, 75, 'Finalizing test job');

    // Simulate failure if requested
    if (jobData.shouldFail) {
      this.log(job, 'warn', 'Test job configured to fail');
      throw new Error(`Intentional test failure: ${jobData.message}`);
    }

    // Success
    this.log(job, 'info', 'Test job completed successfully', {
      message: jobData.message,
    });

    return {
      success: true,
      message: 'Test job completed successfully',
      data: {
        receivedMessage: jobData.message,
        processedAt: new Date().toISOString(),
        jobId: job.id,
      },
    };
  }
}

/**
 * Create and export a test job handler instance
 */
export const testJobHandler = new TestJobHandler();

export default testJobHandler;
