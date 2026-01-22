/**
 * Generation Domain Logger
 *
 * Логирование LLM generation: model calls, tokens, quality checks.
 */

import logger from '../index';

export interface GenerationContext {
  courseId: string;
  model: string;
  stage: string;
  attemptNumber: number;
}

/**
 * Логирует LLM вызов.
 */
export function logLLMCall(
  ctx: GenerationContext & {
    tokensUsed: number;
    durationMs: number;
    cached: boolean;
  }
): void {
  logger.info(ctx, `LLM call: ${ctx.model} (${ctx.tokensUsed} tokens, ${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку генерации.
 * Пишется в error_logs.
 */
export function logGenerationError(
  ctx: GenerationContext & {
    error: Error;
    retryable: boolean;
    fallbackModel?: string;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `Generation error: ${ctx.model}`);
}

/**
 * Логирует успешную генерацию.
 */
export function logGenerationSuccess(
  ctx: GenerationContext & {
    tokensUsed: number;
    durationMs: number;
    qualityScore?: number;
  }
): void {
  logger.info(ctx, `Generation success: ${ctx.model}`);
}

/**
 * Логирует quality check.
 */
export function logQualityCheck(params: {
  courseId: string;
  qualityScore: number;
  threshold: number;
  passed: boolean;
  checkType: string;
}): void {
  const level = params.passed ? 'info' : 'warn';
  logger[level](
    params,
    `Quality check ${params.passed ? 'passed' : 'failed'}: ${params.checkType}`
  );
}

/**
 * Логирует fallback на другую модель.
 */
export function logModelFallback(params: {
  courseId: string;
  fromModel: string;
  toModel: string;
  reason: string;
}): void {
  logger.warn(params, `Model fallback: ${params.fromModel} → ${params.toModel}`);
}
