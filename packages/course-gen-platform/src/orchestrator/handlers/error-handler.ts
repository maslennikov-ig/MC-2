/**
 * Error Handler for Failed Jobs
 *
 * This module provides error handling for failed BullMQ jobs, including
 * detailed error logging, retry decision logic, and failure notifications.
 *
 * @module orchestrator/handlers/error-handler
 */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

import { Job } from 'bullmq';
import { JobData, JobType } from '@megacampus/shared-types';
import logger from '../../shared/logger';
import { metricsStore } from '../metrics';

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
 * @param {Error | unknown} error - The error to classify
 * @returns {ErrorType} The error classification
 */
export function classifyError(error: Error | unknown): ErrorType {
  if (!(error instanceof Error)) {
    return ErrorType.UNKNOWN;
  }

  const message = error.message.toLowerCase();

  // Transient errors that should be retried
  const transientPatterns = [
    'timeout',
    'network',
    'econnrefused',
    'econnreset',
    'enotfound',
    'etimedout',
    'socket',
    'redis connection',
    'rate limit',
    'too many requests',
    'service unavailable',
    '503',
    '502',
    '504',
  ];

  for (const pattern of transientPatterns) {
    if (message.includes(pattern)) {
      return ErrorType.TRANSIENT;
    }
  }

  // Permanent errors that should not be retried
  const permanentPatterns = [
    'validation',
    'invalid',
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
    '400',
    '401',
    '403',
    '404',
    'schema',
    'parse',
  ];

  for (const pattern of permanentPatterns) {
    if (message.includes(pattern)) {
      return ErrorType.PERMANENT;
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
    logger.warn({
      jobId: job.id,
      jobType: job.name,
      errorType,
      currentAttempt,
      maxAttempts,
    }, 'Job failed with permanent error, will not retry');
    return false;
  }

  // Retry transient errors if we haven't exhausted attempts
  if (errorType === ErrorType.TRANSIENT && currentAttempt < maxAttempts) {
    logger.info({
      jobId: job.id,
      jobType: job.name,
      errorType,
      currentAttempt,
      maxAttempts,
      remainingAttempts: maxAttempts - currentAttempt,
    }, 'Job failed with transient error, will retry');
    return true;
  }

  // For unknown errors, retry if we have attempts left
  if (errorType === ErrorType.UNKNOWN && currentAttempt < maxAttempts) {
    logger.warn({
      jobId: job.id,
      jobType: job.name,
      errorType,
      currentAttempt,
      maxAttempts,
    }, 'Job failed with unknown error, will retry cautiously');
    return true;
  }

  // No more retries
  logger.error({
    jobId: job.id,
    jobType: job.name,
    errorType,
    currentAttempt,
    maxAttempts,
  }, 'Job failed and exhausted all retry attempts');
  return false;
}

/**
 * Handle a failed job
 *
 * This function is called when a job fails. It logs the failure with full context,
 * records metrics, and determines if the job should be retried.
 *
 * @param {Job<JobData>} job - The failed job
 * @param {Error | unknown} error - The error that caused the failure
 */
export function handleJobFailure(job: Job<JobData>, error: Error | unknown): void {
  const jobData = job.data;
  const errorType = classifyError(error);
  const willRetry = shouldRetryJob(job, error);

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
    error:
      error instanceof Error
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

  // Log the failure
  logger.error(errorLog, 'Job failed');

  // Record retry metric if applicable
  if (willRetry) {
    metricsStore.recordJobRetry(job.name as JobType);
  }

  // TODO (Future): Send failure notifications
  // - Alert admins for critical jobs
  // - Notify users for user-facing jobs
  // - Update job status in database
  // - Trigger cleanup if needed
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
  logger.warn({
    jobId,
    jobType,
    timestamp: new Date().toISOString(),
    note: 'Worker may have crashed or job timed out',
  }, 'Job stalled');

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
  logger.error({
    jobId: job.id,
    jobType: job.name,
    organizationId: job.data.organizationId,
    courseId: job.data.courseId,
    timestamp: new Date().toISOString(),
  }, 'Job timed out');

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
