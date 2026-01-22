/**
 * Generation Domain Logger
 *
 * Логирование LLM generation: model calls, tokens, quality checks.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, tokensUsed)
 * but enhanced logger automatically converts to snake_case for DB.
 */

import logger from '../index';

export interface GenerationContext {
  courseId: string;
  model: string;
  stage: string;
  attemptNumber: number;
}

/**
 * Type guard for GenerationContext
 */
export function isGenerationContext(obj: unknown): obj is GenerationContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const ctx = obj as Record<string, unknown>;
  return (
    typeof ctx.courseId === 'string' &&
    typeof ctx.model === 'string' &&
    typeof ctx.stage === 'string' &&
    typeof ctx.attemptNumber === 'number'
  );
}

/**
 * Логирует LLM вызов.
 *
 * @example
 * ```typescript
 * logLLMCall({
 *   courseId: 'abc-123',
 *   model: 'gpt-4o',
 *   stage: 'stage_5',
 *   attemptNumber: 1,
 *   tokensUsed: 1500,
 *   durationMs: 2300,
 *   cached: false
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logGenerationError({
 *   courseId: 'abc-123',
 *   model: 'gpt-4o',
 *   stage: 'stage_5',
 *   attemptNumber: 1,
 *   error: new Error('Rate limit exceeded'),
 *   retryable: true,
 *   fallbackModel: 'gpt-4o-mini'
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logGenerationSuccess({
 *   courseId: 'abc-123',
 *   model: 'gpt-4o',
 *   stage: 'stage_5',
 *   attemptNumber: 1,
 *   tokensUsed: 1500,
 *   durationMs: 2300,
 *   qualityScore: 0.92
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logQualityCheck({
 *   courseId: 'abc-123',
 *   qualityScore: 0.85,
 *   threshold: 0.8,
 *   passed: true,
 *   checkType: 'semantic_similarity'
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logModelFallback({
 *   courseId: 'abc-123',
 *   fromModel: 'gpt-4o',
 *   toModel: 'gpt-4o-mini',
 *   reason: 'Rate limit exceeded'
 * });
 * ```
 */
export function logModelFallback(params: {
  courseId: string;
  fromModel: string;
  toModel: string;
  reason: string;
}): void {
  logger.warn(params, `Model fallback: ${params.fromModel} → ${params.toModel}`);
}
