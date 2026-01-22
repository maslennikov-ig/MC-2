/**
 * Job Domain Logger
 *
 * Логирование background jobs: BullMQ workers, queues.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (jobId, courseId)
 * but enhanced logger automatically converts to snake_case for DB.
 */

import logger from '../index';

export interface JobContext {
  jobId: string;
  jobType: string;
  courseId?: string;
  attemptNumber: number;
}

/**
 * Type guard for JobContext
 */
export function isJobContext(obj: unknown): obj is JobContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const ctx = obj as Record<string, unknown>;
  return (
    typeof ctx.jobId === 'string' &&
    typeof ctx.jobType === 'string' &&
    typeof ctx.attemptNumber === 'number' &&
    (ctx.courseId === undefined || typeof ctx.courseId === 'string')
  );
}

/**
 * Логирует начало job.
 *
 * @example
 * ```typescript
 * logJobStart({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 1
 * });
 * ```
 */
export function logJobStart(ctx: JobContext): void {
  logger.info(ctx, `Job started: ${ctx.jobType}`);
}

/**
 * Логирует успешное завершение job.
 *
 * @example
 * ```typescript
 * logJobComplete({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 1,
 *   durationMs: 45000
 * });
 * ```
 */
export function logJobComplete(ctx: JobContext & { durationMs: number }): void {
  logger.info(ctx, `Job completed: ${ctx.jobType} (${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку job.
 * Пишется в error_logs.
 *
 * @example
 * ```typescript
 * logJobError({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 3,
 *   error: new Error('Max retries exceeded'),
 *   retriable: false,
 *   moveToDLQ: true
 * });
 * ```
 */
export function logJobError(
  ctx: JobContext & {
    error: Error;
    retriable: boolean;
    moveToDLQ: boolean;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `Job error: ${ctx.jobType}`);
}

/**
 * Логирует прогресс job.
 *
 * @example
 * ```typescript
 * logJobProgress({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 1,
 *   progress: 45,
 *   currentStep: 'Generating section 3/7'
 * });
 * ```
 */
export function logJobProgress(
  ctx: JobContext & {
    progress: number;
    currentStep: string;
  }
): void {
  logger.info(ctx, `Job progress: ${ctx.currentStep} (${ctx.progress}%)`);
}

/**
 * Логирует retry job.
 *
 * @example
 * ```typescript
 * logJobRetry({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 1,
 *   reason: 'Rate limit exceeded',
 *   nextAttempt: 2,
 *   maxAttempts: 3,
 *   delayMs: 5000
 * });
 * ```
 */
export function logJobRetry(
  ctx: JobContext & {
    reason: string;
    nextAttempt: number;
    maxAttempts: number;
    delayMs: number;
  }
): void {
  logger.warn(ctx, `Job retry: ${ctx.jobType} (${ctx.nextAttempt}/${ctx.maxAttempts})`);
}

/**
 * Логирует stalled job.
 *
 * @example
 * ```typescript
 * logJobStalled({
 *   jobId: 'job-123',
 *   jobType: 'COURSE_GENERATION',
 *   courseId: 'abc-123',
 *   attemptNumber: 1
 * });
 * ```
 */
export function logJobStalled(ctx: JobContext): void {
  logger.warn(ctx, `Job stalled: ${ctx.jobType}`);
}
