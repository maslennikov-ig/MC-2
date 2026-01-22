/**
 * Pipeline Domain Logger
 *
 * Логирование pipeline/orchestration: stage transitions, phase execution.
 */

import logger from '../index';

export interface PipelineContext {
  courseId: string;
  stage: string; // 'stage_5', 'stage_6'
  phase: string; // 'metadata', 'sections', 'quality'
  attemptNumber?: number;
}

/**
 * Логирует начало фазы пайплайна.
 */
export function logPipelineStart(ctx: PipelineContext): void {
  logger.info(ctx, `Pipeline phase started: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует успешное завершение фазы.
 */
export function logPipelineComplete(ctx: PipelineContext & { durationMs: number }): void {
  logger.info(ctx, `Pipeline phase completed: ${ctx.stage}/${ctx.phase}`);
}

/**
 * Логирует ошибку пайплайна.
 * Пишется в error_logs.
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
