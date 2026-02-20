/**
 * Error Handler for Failed Jobs
 *
 * This module provides error handling for failed BullMQ jobs, including
 * detailed error logging, retry decision logic, and failure notifications.
 *
 * Uses custom PipelineError classes for instanceof-based error classification
 * instead of string matching on error messages.
 *
 * @module orchestrator/handlers/error-handler
 */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

import { Job } from 'bullmq';
import { JobData, JobType } from '@megacampus/shared-types';
import logger, { logPermanentFailure } from '../../shared/logger';
import { logger as baseLogger } from '@megacampus/shared-logger';
import { metricsStore } from '../metrics';
import {
  PipelineError,
  PipelineInterrupt,
  PipelineTransientError,
  PipelineValidationError,
  PipelineInternalError,
  isPipelineInterrupt,
  shouldLogAsError,
} from '../../shared/errors';

/**
 * Error classification for retry decisions
 */
export enum ErrorType {
  /** Temporary error that should be retried (network, timeout, etc.) */
  TRANSIENT = 'transient',
  /** Permanent error that should not be retried (validation, auth, etc.) */
  PERMANENT = 'permanent',
  /** Unknown error type */
  UNKNOWN = 'unknown',
}

/**
 * Classify an error to determine if it should be retried
 *
 * Uses instanceof checks for PipelineError classes first,
 * then falls back to string pattern matching for legacy/external errors.
 *
 * @param {Error | unknown} error - The error to classify
 * @returns {ErrorType} The error classification
 */
export function classifyError(error: Error | unknown): ErrorType {
  // =========================================================================
  // PRIORITY 1: instanceof checks for PipelineError classes
  // =========================================================================

  // Pipeline interrupts are NOT errors - treated as permanent (no retry)
  if (error instanceof PipelineInterrupt) {
    return ErrorType.PERMANENT;
  }

  // Transient errors should be retried
  if (error instanceof PipelineTransientError) {
    return ErrorType.TRANSIENT;
  }

  // Validation errors are permanent (business logic failures)
  if (error instanceof PipelineValidationError) {
    return ErrorType.PERMANENT;
  }

  // Internal errors are permanent (bugs that won't fix themselves on retry)
  if (error instanceof PipelineInternalError) {
    return ErrorType.PERMANENT;
  }

  // Any other PipelineError - check retryable flag
  if (error instanceof PipelineError) {
    return error.retryable ? ErrorType.TRANSIENT : ErrorType.PERMANENT;
  }

  // =========================================================================
  // PRIORITY 2: String pattern matching (legacy/external errors)
  // =========================================================================

  if (!(error instanceof Error)) {
    return ErrorType.UNKNOWN;
  }

  /**
   * Error pattern classification map
   *
   * ORDER MATTERS: LLM-specific patterns (more specific) must be checked
   * before generic transient patterns. For example, "placeholder" is an
   * LLM-specific retriable error, not a generic transient error.
   *
   * Pattern matching is case-insensitive via lowercase comparison.
   *
   * Uses Map for O(1) lookup vs O(n) sequential array checks.
   */
  const ERROR_PATTERN_MAP = new Map<string, ErrorType>([
    // LLM-specific retriable errors (check FIRST - more specific than generic transient)
    // These are errors from LLM generation that may succeed on retry with different output
    ['placeholders detected', ErrorType.TRANSIENT], // LLM generated placeholder text
    ['placeholder', ErrorType.TRANSIENT], // Generic placeholder detection
    ['model fallback', ErrorType.TRANSIENT], // Model fallback needed
    ['generation failed', ErrorType.TRANSIENT], // Generic generation failure
    ['content generation', ErrorType.TRANSIENT], // Content generation issues

    // Transient errors (network/service issues)
    ['timeout', ErrorType.TRANSIENT],
    ['network', ErrorType.TRANSIENT],
    ['econnrefused', ErrorType.TRANSIENT],
    ['econnreset', ErrorType.TRANSIENT],
    ['enotfound', ErrorType.TRANSIENT],
    ['etimedout', ErrorType.TRANSIENT],
    ['socket', ErrorType.TRANSIENT],
    ['redis connection', ErrorType.TRANSIENT],
    ['rate limit', ErrorType.TRANSIENT],
    ['too many requests', ErrorType.TRANSIENT],
    ['service unavailable', ErrorType.TRANSIENT],
    ['503', ErrorType.TRANSIENT],
    ['502', ErrorType.TRANSIENT],
    ['504', ErrorType.TRANSIENT],

    // Permanent errors (validation/auth issues)
    ['unavailable for legal reasons', ErrorType.PERMANENT], // Jina 451 content policy
    ['content policy', ErrorType.PERMANENT],
    ['validation', ErrorType.PERMANENT],
    ['invalid', ErrorType.PERMANENT],
    ['unauthorized', ErrorType.PERMANENT],
    ['forbidden', ErrorType.PERMANENT],
    ['not found', ErrorType.PERMANENT],
    ['bad request', ErrorType.PERMANENT],
    ['400', ErrorType.PERMANENT],
    ['401', ErrorType.PERMANENT],
    ['403', ErrorType.PERMANENT],
    ['404', ErrorType.PERMANENT],
    ['schema', ErrorType.PERMANENT],
    ['parse', ErrorType.PERMANENT],
    ['awaiting_clarifying_answers', ErrorType.PERMANENT], // Prevent retry when waiting for user answers
  ]);

  // Single-pass pattern matching with O(1) Map lookups
  const messageLower = error.message.toLowerCase();
  for (const [pattern, type] of ERROR_PATTERN_MAP) {
    if (messageLower.includes(pattern)) {
      return type;
    }
  }

  return ErrorType.UNKNOWN;
}

/**
 * Determine if a job should be retried based on error type and attempt count
 *
 * @param {Job<JobData>} job - The failed job
 * @param {Error | unknown} error - The error that caused the failure
 * @returns {boolean} True if the job should be retried
 */
export function shouldRetryJob(job: Job<JobData>, error: Error | unknown): boolean {
  const errorType = classifyError(error);
  const maxAttempts = job.opts.attempts || 3;
  const currentAttempt = job.attemptsMade;

  // Never retry permanent errors
  if (errorType === ErrorType.PERMANENT) {
    baseLogger.warn(
      {
        jobId: job.id,
        jobType: job.name,
        errorType,
        currentAttempt,
        maxAttempts,
      },
      'Job failed with permanent error, will not retry'
    );
    return false;
  }

  // Retry transient errors if we haven't exhausted attempts
  if (errorType === ErrorType.TRANSIENT && currentAttempt < maxAttempts) {
    logger.info(
      {
        jobId: job.id,
        jobType: job.name,
        errorType,
        currentAttempt,
        maxAttempts,
        remainingAttempts: maxAttempts - currentAttempt,
      },
      'Job failed with transient error, will retry'
    );
    return true;
  }

  // For unknown errors, retry if we have attempts left
  if (errorType === ErrorType.UNKNOWN && currentAttempt < maxAttempts) {
    baseLogger.warn(
      {
        jobId: job.id,
        jobType: job.name,
        errorType,
        currentAttempt,
        maxAttempts,
      },
      'Job failed with unknown error, will retry cautiously'
    );
    return true;
  }

  // No more retries
  baseLogger.error(
    {
      jobId: job.id,
      jobType: job.name,
      errorType,
      currentAttempt,
      maxAttempts,
    },
    'Job failed and exhausted all retry attempts'
  );
  return false;
}

/**
 * Handle a failed job
 *
 * This function is called when a job fails. It logs the failure with full context,
 * records metrics, and determines if the job should be retried.
 *
 * IMPORTANT: PipelineInterrupt errors are NOT logged at ERROR level - they are
 * control flow signals, not actual errors. They get logged at INFO level.
 *
 * @param {Job<JobData>} job - The failed job
 * @param {Error | unknown} error - The error that caused the failure
 */
export function handleJobFailure(job: Job<JobData>, error: Error | unknown): void {
  const jobData = job.data;
  const errorType = classifyError(error);
  const willRetry = shouldRetryJob(job, error);

  // Check if this is a pipeline interrupt (control flow, not error)
  const isInterrupt = isPipelineInterrupt(error);

  // Create structured error log
  const errorLog = {
    jobId: job.id,
    jobType: job.name,
    organizationId: jobData.organizationId,
    courseId: jobData.courseId,
    userId: jobData.userId,
    attemptsMade: job.attemptsMade,
    attemptsMax: job.opts.attempts || 3,
    errorType,
    willRetry,
    isInterrupt,
    error:
      error instanceof PipelineError
        ? error.toLogObject()
        : error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    jobData: {
      ...jobData,
      // Redact sensitive information if any
    },
    timestamp: new Date().toISOString(),
  };

  // Log at appropriate level based on error type
  // PipelineInterrupt = INFO (control flow, not error)
  // PipelineTransientError = WARN (will retry)
  // Other errors = ERROR
  if (isInterrupt) {
    logger.info(errorLog, 'Job paused (interrupt)');
  } else if (!shouldLogAsError(error)) {
    baseLogger.warn(errorLog, 'Job failed (transient, will retry)');
  } else {
    baseLogger.error(errorLog, 'Job failed');
  }

  // Record retry metric if applicable
  if (willRetry) {
    metricsStore.recordJobRetry(job.name as JobType);
  }

  // Skip database logging for interrupts (they are not errors)
  if (isInterrupt) {
    return;
  }

  // Log errors to error_logs table for admin visibility
  // - WARNING for retryable errors (transient issues that will retry)
  // - ERROR for final failures (all retries exhausted)
  // - CRITICAL for permanent errors (won't retry due to error type)
  const getSeverity = (): 'WARNING' | 'ERROR' | 'CRITICAL' => {
    // Use severity from PipelineError if available
    if (error instanceof PipelineError) {
      if (error.severity === 'INFO' || error.severity === 'WARNING') return 'WARNING';
      if (error.severity === 'CRITICAL') return 'CRITICAL';
      return 'ERROR';
    }
    if (willRetry) return 'WARNING';
    if (errorType === ErrorType.PERMANENT) return 'CRITICAL';
    return 'ERROR';
  };

  logPermanentFailure({
    organization_id: jobData.organizationId,
    user_id: jobData.userId,
    // Use job_id as problem_id to group related retry errors together
    problem_id: job.id,
    error_message: error instanceof Error ? error.message : String(error),
    stack_trace: error instanceof Error ? error.stack : undefined,
    severity: getSeverity(),
    job_id: job.id,
    job_type: job.name,
    metadata: {
      courseId: jobData.courseId,
      errorType,
      errorCode: error instanceof PipelineError ? error.code : undefined,
      attemptsMade: job.attemptsMade,
      attemptsMax: job.opts.attempts || 3,
      willRetry,
      isFinalError: !willRetry,
    },
  }).catch(dbError => {
    // Don't fail the handler if DB logging fails
    baseLogger.warn({ err: dbError }, 'Failed to log error to database');
  });
}

/**
 * Handle job stalled event
 *
 * Called when a job has been stalled (worker crashed or timed out).
 *
 * @param {string} jobId - The ID of the stalled job
 * @param {JobType} jobType - The type of job
 */
export function handleJobStalled(jobId: string, jobType: JobType): void {
  baseLogger.info(
    {
      jobId,
      jobType,
      timestamp: new Date().toISOString(),
      note: 'Worker may have crashed or job timed out',
    },
    'Job stalled'
  );

  // TODO (Future): Implement stalled job recovery
  // - Check if worker is still alive
  // - Decide whether to retry or fail
  // - Clean up any partial work
}

/**
 * Handle job timeout
 *
 * Called when a job exceeds its timeout limit.
 *
 * @param {Job<JobData>} job - The timed out job
 */
export function handleJobTimeout(job: Job<JobData>): void {
  baseLogger.error(
    {
      jobId: job.id,
      jobType: job.name,
      organizationId: job.data.organizationId,
      courseId: job.data.courseId,
      timestamp: new Date().toISOString(),
    },
    'Job timed out'
  );

  // TODO (Future): Implement timeout-specific handling
  // - Cancel any ongoing work
  // - Clean up resources
  // - Update status to timeout instead of failure
}

export default {
  classifyError,
  shouldRetryJob,
  handleJobFailure,
  handleJobStalled,
  handleJobTimeout,
};
