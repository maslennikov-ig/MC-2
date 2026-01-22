/**
 * Pipeline Domain Logger
 *
 * Логирование pipeline/orchestration: stage transitions, phase execution.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, attemptNumber)
 * but enhanced logger automatically converts to snake_case for DB.
 */

import logger from '../index';

export interface PipelineContext {
  courseId: string;
  stage: string; // 'stage_5', 'stage_6'
  phase: string; // 'metadata', 'sections', 'quality'
  attemptNumber?: number;
}

/**
 * Type guard for PipelineContext
 */
export function isPipelineContext(obj: unknown): obj is PipelineContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const ctx = obj as Record<string, unknown>;
  return (
    typeof ctx.courseId === 'string' &&
    typeof ctx.stage === 'string' &&
    typeof ctx.phase === 'string' &&
    (ctx.attemptNumber === undefined || typeof ctx.attemptNumber === 'number')
  );
}

/**
 * Логирует начало фазы пайплайна.
 *
 * @example
 * ```typescript
 * logPipelineStart({
 *   courseId: 'abc-123',
 *   stage: 'stage_5',
 *   phase: 'metadata',
 *   attemptNumber: 1
 * });
 * ```
 */
export function logPipelineStart(ctx: PipelineContext): void {
  logger.info(ctx, `Pipeline phase started: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует успешное завершение фазы.
 *
 * @example
 * ```typescript
 * logPipelineComplete({
 *   courseId: 'abc-123',
 *   stage: 'stage_5',
 *   phase: 'metadata',
 *   durationMs: 1250
 * });
 * ```
 */
export function logPipelineComplete(ctx: PipelineContext & { durationMs: number }): void {
  logger.info(ctx, `Pipeline phase completed: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует ошибку пайплайна.
 * Пишется в error_logs.
 *
 * @example
 * ```typescript
 * logPipelineError({
 *   courseId: 'abc-123',
 *   stage: 'stage_5',
 *   phase: 'validation',
 *   error: new Error('Validation failed'),
 *   recoverable: true
 * });
 * ```
 */
export function logPipelineError(
  ctx: PipelineContext & {
    error: Error;
    recoverable: boolean;
  }
): void {
  const { error, recoverable, ...rest } = ctx;
  logger.error({ ...rest, err: error, recoverable }, `Pipeline error: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует переход между стадиями.
 *
 * @example
 * ```typescript
 * logStageTransition({
 *   courseId: 'abc-123',
 *   fromStage: 'stage_4',
 *   toStage: 'stage_5'
 * });
 * ```
 */
export function logStageTransition(params: {
  courseId: string;
  fromStage: string;
  toStage: string;
}): void {
  logger.info(params, `Stage transition: ${params.fromStage} → ${params.toStage}`);
}

/**
 * Логирует retry attempt.
 *
 * @example
 * ```typescript
 * logPipelineRetry({
 *   courseId: 'abc-123',
 *   stage: 'stage_5',
 *   phase: 'generation',
 *   reason: 'Rate limit exceeded',
 *   nextAttempt: 2,
 *   maxAttempts: 3
 * });
 * ```
 */
export function logPipelineRetry(
  ctx: PipelineContext & {
    reason: string;
    nextAttempt: number;
    maxAttempts: number;
  }
): void {
  logger.warn(
    ctx,
    `Pipeline retry: ${ctx.stage}/${ctx.phase} (${ctx.nextAttempt}/${ctx.maxAttempts})`
  );
}
