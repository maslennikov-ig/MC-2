/**
 * Base Job Handler
 *
 * Abstract base class for all job handlers. Provides common functionality for
 * error handling, logging, and progress tracking.
 *
 * @module orchestrator/handlers/base-handler
 */

import { Job } from 'bullmq';
import { JobData, JobType, Database } from '@megacampus/shared-types';
import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from 'pino';
import logger from '../../shared/logger';
import { metricsStore } from '../metrics';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { JobCancelledError } from '../../server/errors/typed-errors';
import { concurrencyTracker } from '../../shared/concurrency';
import { getTranslator, type Locale, type TranslatorFn } from '../../shared/i18n';

/**
 * Cached translator instances per locale
 * Since we only have 2 locales, this is more efficient than creating
 * a new translator function for every progress update.
 */
const translatorCache = new Map<Locale, TranslatorFn>();

/**
 * Get cached translator instance for the specified locale
 */
function getCachedTranslator(locale: Locale): TranslatorFn {
  let t = translatorCache.get(locale);
  if (!t) {
    t = getTranslator(locale);
    translatorCache.set(locale, t);
  }
  return t;
}

/**
 * Job execution result
 */
export interface JobResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * Job type to step ID mapping
 */
const JOB_TYPE_TO_STEP: Record<JobType, number | null> = {
  [JobType.TEST_JOB]: null,
  [JobType.INITIALIZE]: 1,
  [JobType.DOCUMENT_PROCESSING]: 2,
  [JobType.SUMMARY_GENERATION]: 2, // Fallback - should not be used in step 1 recovery
  [JobType.DOCUMENT_CLASSIFICATION]: 2, // Stage 3 classification
  [JobType.STRUCTURE_ANALYSIS]: 2,
  [JobType.STRUCTURE_GENERATION]: 3,
  [JobType.TEXT_GENERATION]: 4,
  [JobType.LESSON_CONTENT]: 4, // Stage 6 lesson content generation
  [JobType.ENRICHMENT_GENERATION]: null, // Stage 7 enrichments (no course progress step)
  [JobType.FINALIZATION]: 5,
};

/**
 * Abstract base class for job handlers
 *
 * All job handlers should extend this class and implement the `execute` method.
 * The base class provides:
 * - Structured logging with job context
 * - Error handling and reporting
 * - Progress tracking
 * - Metrics collection
 * - Step 1 recovery for orphaned jobs
 * - Course progress updates
 * - Concurrency slot management
 *
 * @abstract
 */
export abstract class BaseJobHandler<T extends JobData = JobData> {
  protected readonly jobType: JobType;

  /**
   * Create a new job handler
   *
   * @param {JobType} jobType - The type of job this handler processes
   */
  constructor(jobType: JobType) {
    this.jobType = jobType;
  }

  /**
   * Execute the job
   *
   * This method must be implemented by subclasses to define the job's logic.
   *
   * @abstract
   * @param {T} jobData - The job data payload
   * @param {Job<T>} job - The BullMQ job instance
   * @returns {Promise<JobResult>} The job execution result
   */
  abstract execute(jobData: T, job: Job<T>): Promise<JobResult>;

  /**
   * Process the job with error handling and logging
   *
   * This method wraps the `execute` method with common functionality:
   * - Logging job start/end
   * - Error handling
   * - Metrics collection
   * - Progress updates
   * - Step 1 recovery (T020)
   * - Course progress updates (T021)
   * - Concurrency slot release (T022)
   *
   * @param {Job<T>} job - The BullMQ job instance
   * @returns {Promise<JobResult>} The job execution result
   */
  async process(job: Job<T>): Promise<JobResult> {
    const startTime = Date.now();
    const { courseId, userId, locale = 'ru' } = job.data as JobData;
    const jobLogger = logger.child({
      jobId: job.id,
      jobType: this.jobType,
      organizationId: job.data.organizationId,
      courseId,
      userId,
    });

    jobLogger.info({
      attemptsMade: job.attemptsMade,
      attemptsMax: job.opts.attempts,
    }, 'Job processing started');

    metricsStore.recordJobStart(this.jobType);

    try {
      const supabase = getSupabaseAdmin();

      // T020: Check for orphaned job (step 1 not completed by orchestrator)
      await this.checkAndRecoverStep1(job, supabase, jobLogger);

      // Update progress to indicate processing has started
      await job.updateProgress({ status: 'processing', percent: 0 });

      // T021: Update course progress to 'in_progress' at job start
      const stepId = JOB_TYPE_TO_STEP[this.jobType];
      if (stepId && stepId > 1) {
        await this.updateCourseProgress(
          supabase,
          courseId,
          stepId,
          'in_progress',
          job.id!,
          jobLogger,
          locale as Locale
        );
      }

      // Execute the job
      const result = await this.execute(job.data, job);

      const duration = Date.now() - startTime;

      if (result.success) {
        metricsStore.recordJobSuccess(this.jobType, duration);
        jobLogger.info({
          duration,
          message: result.message,
        }, 'Job completed successfully');

        // T021: Update course progress to 'completed' on success
        if (stepId && stepId > 1) {
          await this.updateCourseProgress(
            supabase,
            courseId,
            stepId,
            'completed',
            job.id!,
            jobLogger,
            locale as Locale,
            { duration_ms: duration }
          );
        }
      } else {
        metricsStore.recordJobFailure(this.jobType, duration);
        jobLogger.warn({
          duration,
          message: result.message,
          error: result.error,
        }, 'Job completed with failure');

        // T021: Update course progress to 'failed' on failure
        if (stepId && stepId > 1) {
          await this.updateCourseProgress(
            supabase,
            courseId,
            stepId,
            'failed',
            job.id!,
            jobLogger,
            locale as Locale,
            {
              error_message: result.message || 'Job completed with failure',
              error_details: result.error || 'Unknown error',
            }
          );
        }
      }

      // Update progress to 100%
      await job.updateProgress({ status: 'completed', percent: 100 });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsStore.recordJobFailure(this.jobType, duration);

      jobLogger.error({
        duration,
        error,
        attemptsMade: job.attemptsMade,
        attemptsMax: job.opts.attempts,
      }, 'Job processing failed');

      // T021: Update course progress to 'failed' on exception
      const stepId = JOB_TYPE_TO_STEP[this.jobType];
      if (stepId && stepId > 1) {
        try {
          const supabase = getSupabaseAdmin();
          await this.updateCourseProgress(
            supabase,
            courseId,
            stepId,
            'failed',
            job.id!,
            jobLogger,
            locale as Locale,
            {
              error_message: error instanceof Error ? error.message : String(error),
              error_details: String(error),
            }
          );
        } catch (progressError) {
          jobLogger.error({
            error: progressError,
          }, 'Failed to update course progress on error');
        }
      }

      // Update progress to indicate failure
      await job.updateProgress({ status: 'failed', percent: 0 });

      // Re-throw to let BullMQ handle retries
      throw error;
    } finally {
      // T022: Release concurrency slot in finally block (always executes)
      try {
        await concurrencyTracker.release(userId);
        jobLogger.debug({ userId }, 'Concurrency slot released');
      } catch (releaseError) {
        jobLogger.error(
          {
            error: releaseError,
            userId,
          },
          'Failed to release concurrency slot'
        );
      }
    }
  }

  /**
   * Update job progress
   *
   * Helper method to update job progress with a standardized format.
   *
   * @protected
   * @param {Job<T>} job - The BullMQ job instance
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} [message] - Optional progress message
   * @returns {Promise<void>}
   */
  protected async updateProgress(job: Job<T>, percent: number, message?: string): Promise<void> {
    try {
      await job.updateProgress({
        status: 'processing',
        percent: Math.min(100, Math.max(0, percent)),
        message,
      });
    } catch (error) {
      // Ignore "Missing key" errors - job may have already completed
      // This is a race condition that can occur in fast-executing jobs
      if (error instanceof Error && !error.message.includes('Missing key')) {
        throw error;
      }
    }
  }

  /**
   * Log a message with job context
   *
   * @protected
   * @param {Job<T>} job - The BullMQ job instance
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Log message
   * @param {Record<string, unknown>} [meta] - Additional metadata
   */
  protected log(
    job: Job<T>,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const jobLogger = logger.child({
      jobId: job.id,
      jobType: this.jobType,
      organizationId: job.data.organizationId,
      courseId: job.data.courseId,
    });

    jobLogger[level](meta || {}, message);
  }

  /**
   * Check if the job should be cancelled
   *
   * @deprecated Use checkCancellation() instead for proper cancellation handling
   * @protected
   * @param {Job<T>} job - The BullMQ job instance
   * @returns {Promise<boolean>} True if the job is cancelled
   */
  protected async isCancelled(job: Job<T>): Promise<boolean> {
    const state = await job.getState();
    return state === 'failed' || state === 'completed';
  }

  /**
   * Check if the job has been cancelled via database flag
   *
   * Long-running job handlers should call this method periodically (e.g., after
   * each major step or every few seconds) to detect user-initiated cancellation.
   *
   * If the job is cancelled, this method throws JobCancelledError, which is
   * caught by the worker and handled gracefully (marked as cancelled, not failed).
   *
   * @protected
   * @param {Job<T>} job - The BullMQ job instance
   * @throws {JobCancelledError} If the job has been cancelled
   * @returns {Promise<void>}
   *
   * @example
   * // In a long-running job handler
   * async execute(jobData: MyJobData, job: Job<MyJobData>): Promise<JobResult> {
   *   // Step 1: Process documents
   *   await this.processDocuments(jobData);
   *   await this.checkCancellation(job); // Check if cancelled
   *
   *   // Step 2: Generate embeddings
   *   await this.generateEmbeddings(jobData);
   *   await this.checkCancellation(job); // Check if cancelled
   *
   *   // Step 3: Store results
   *   await this.storeResults(jobData);
   *   await this.checkCancellation(job); // Check if cancelled
   *
   *   return { success: true };
   * }
   */
  protected async checkCancellation(job: Job<T>): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Query database for cancellation flag
    // Use maybeSingle() instead of single() to handle race conditions gracefully
    const { data, error } = await supabase
      .from('job_status')
      .select('cancelled, cancelled_by')
      .eq('job_id', job.id!)
      .maybeSingle();

    // If query fails, log error but don't throw - allow job to continue
    // (Database errors shouldn't prevent job execution)
    if (error) {
      this.log(job, 'warn', 'Failed to check job cancellation status', { error: error.message });
      return;
    }

    // If no data returned, record doesn't exist yet - not cancelled
    if (!data) {
      return;
    }

    // If cancelled flag is set, throw JobCancelledError
    if (data.cancelled) {
      const cancelledBy = data.cancelled_by || undefined;
      throw new JobCancelledError(job.id!, cancelledBy);
    }
  }

  /**
   * T020: Check and recover orphaned step 1
   *
   * Detects if the orchestrator failed to complete step 1 (initialization)
   * and recovers by marking it completed.
   *
   * @private
   * @param {Job<T>} job - The BullMQ job instance
   * @param {SupabaseClient<Database>} supabase - Supabase admin client
   * @param {Logger} jobLogger - Logger instance with job context
   * @returns {Promise<void>}
   */
  private async checkAndRecoverStep1(job: Job<T>, supabase: SupabaseClient<Database>, jobLogger: Logger): Promise<void> {
    const { courseId, userId } = job.data;

    try {
      // Query generation_progress JSONB column
      const { data: course, error } = await supabase
        .from('courses')
        .select('generation_progress')
        .eq('id', courseId)
        .single();

      if (error) {
        jobLogger.warn({ error: error.message }, 'Failed to check step 1 status');
        return;
      }

      const progress = course?.generation_progress as Record<string, unknown> | null;
      const steps = progress?.steps as Array<{ id: number; status: string }> | undefined;
      const step1 = steps?.find((s) => s.id === 1);

      // Check if step 1 is orphaned (status !== 'completed')
      if (!step1 || step1.status !== 'completed') {
        jobLogger.warn({ courseId, userId }, 'Orphaned job detected - recovering step 1');

        // Call RPC to complete step 1
        await supabase.rpc('update_course_progress', {
          p_course_id: courseId,
          p_step_id: 1,
          p_status: 'completed',
          p_message: 'Инициализация завершена (восстановлено воркером)',
          p_metadata: {
            recovered_by_worker: true,
            job_id: job.id,
            recovery_timestamp: new Date().toISOString(),
          },
        });

        // Write to system_metrics
        await supabase.from('system_metrics').insert({
          event_type: 'orphaned_job_recovery',
          severity: 'warn',
          user_id: userId,
          course_id: courseId,
          job_id: job.id,
          metadata: {
            step_recovered: 1,
            reason: 'step_1_not_completed_by_orchestrator',
          },
        });

        jobLogger.info({ courseId }, 'Step 1 recovered successfully');
      }
    } catch (error) {
      jobLogger.error({ error }, 'Failed to check/recover step 1');
      // Don't throw - allow job to continue
    }
  }

  /**
   * T021: Update course progress
   *
   * Updates the course generation progress via RPC with appropriate
   * localized messages based on job status and user locale.
   *
   * @private
   * @param {SupabaseClient<Database>} supabase - Supabase admin client
   * @param {string} courseId - Course UUID
   * @param {number} stepId - Step ID (2-5)
   * @param {'in_progress' | 'completed' | 'failed'} status - Step status
   * @param {string} jobId - Job ID
   * @param {Logger} jobLogger - Logger instance with job context
   * @param {Locale} locale - User locale (ru/en)
   * @param {Record<string, unknown>} [metadata] - Additional metadata
   * @returns {Promise<void>}
   */
  private async updateCourseProgress(
    supabase: SupabaseClient<Database>,
    courseId: string,
    stepId: number,
    status: 'in_progress' | 'completed' | 'failed',
    jobId: string,
    jobLogger: Logger,
    locale: Locale,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const t = getCachedTranslator(locale);
      // Get localized message for this step and status
      const message = t(`steps.${stepId}.${status}`);

      await supabase.rpc('update_course_progress', {
        p_course_id: courseId,
        p_step_id: stepId,
        p_status: status,
        p_message: message,
        p_metadata: {
          job_id: jobId,
          worker_type: this.jobType,
          ...metadata,
        },
      });

      jobLogger.debug({ courseId, stepId, status }, 'Course progress updated');
    } catch (error) {
      jobLogger.error({ error, courseId, stepId, status }, 'Failed to update course progress');
      // Don't throw - progress update failure shouldn't stop job execution
    }
  }
}

export default BaseJobHandler;
