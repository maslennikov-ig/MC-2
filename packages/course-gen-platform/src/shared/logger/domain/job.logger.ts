/**
 * Job Domain Logger
 *
 * Логирование background jobs: BullMQ workers, queues.
 */

import logger from '../index';

export interface JobContext {
  jobId: string;
  jobType: string;
  courseId?: string;
  attemptNumber: number;
}

/**
 * Логирует начало job.
 */
export function logJobStart(ctx: JobContext): void {
  logger.info(ctx, `Job started: ${ctx.jobType}`);
}

/**
 * Логирует успешное завершение job.
 */
export function logJobComplete(ctx: JobContext & { durationMs: number }): void {
  logger.info(ctx, `Job completed: ${ctx.jobType} (${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку job.
 * Пишется в error_logs.
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
 */
export function logJobStalled(ctx: JobContext): void {
  logger.warn(ctx, `Job stalled: ${ctx.jobType}`);
}
