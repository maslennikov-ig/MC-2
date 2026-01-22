/**
 * RAG Domain Logger
 *
 * Логирование RAG/vector search: queries, cache, embeddings.
 */

import logger from '../index';

export interface RagContext {
  courseId: string;
  queryId?: string;
}

/**
 * Логирует RAG search.
 */
export function logRagSearch(
  ctx: RagContext & {
    query: string;
    topK: number;
    resultsCount: number;
    durationMs: number;
  }
): void {
  logger.info(ctx, `RAG search: ${ctx.resultsCount}/${ctx.topK} results (${ctx.durationMs}ms)`);
}

/**
 * Логирует ошибку RAG.
 * Пишется в error_logs.
 */
export function logRagError(
  ctx: RagContext & {
    error: Error;
    operation: 'search' | 'embed' | 'cache';
    fallbackUsed: boolean;
  }
): void {
  const { error, ...rest } = ctx;
  logger.error({ ...rest, err: error }, `RAG error: ${ctx.operation}`);
}

/**
 * Логирует cache hit/miss.
 */
export function logRagCache(params: {
  courseId: string;
  cacheKey: string;
  hit: boolean;
  ttlSeconds?: number;
}): void {
  logger.info(params, `RAG cache ${params.hit ? 'hit' : 'miss'}`);
}

/**
 * Логирует embedding generation.
 */
export function logRagEmbedding(params: {
  courseId: string;
  textLength: number;
  durationMs: number;
  model: string;
}): void {
  logger.info(params, `RAG embedding: ${params.textLength} chars (${params.durationMs}ms)`);
}

/**
 * Логирует пустой результат поиска (warning).
 */
export function logRagNoResults(
  ctx: RagContext & {
    query: string;
    reason: string;
  }
): void {
  logger.warn(ctx, `RAG no results: ${ctx.reason}`);
}
