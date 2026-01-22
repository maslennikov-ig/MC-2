/**
 * RAG Domain Logger
 *
 * Логирование RAG/vector search: queries, cache, embeddings.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, queryId)
 * but enhanced logger automatically converts to snake_case for DB.
 */

import logger from '../index';

export interface RagContext {
  courseId: string;
  queryId?: string;
}

/**
 * Type guard for RagContext
 */
export function isRagContext(obj: unknown): obj is RagContext {
  if (typeof obj !== 'object' || obj === null) return false;
  const ctx = obj as Record<string, unknown>;
  return (
    typeof ctx.courseId === 'string' &&
    (ctx.queryId === undefined || typeof ctx.queryId === 'string')
  );
}

/**
 * Логирует RAG search.
 *
 * @example
 * ```typescript
 * logRagSearch({
 *   courseId: 'abc-123',
 *   queryId: 'q-456',
 *   query: 'machine learning basics',
 *   topK: 10,
 *   resultsCount: 8,
 *   durationMs: 150
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logRagError({
 *   courseId: 'abc-123',
 *   error: new Error('Qdrant connection failed'),
 *   operation: 'search',
 *   fallbackUsed: true
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logRagCache({
 *   courseId: 'abc-123',
 *   cacheKey: 'rag:abc-123:section-1',
 *   hit: true,
 *   ttlSeconds: 3600
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logRagEmbedding({
 *   courseId: 'abc-123',
 *   textLength: 2500,
 *   durationMs: 120,
 *   model: 'jina-embeddings-v3'
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * logRagNoResults({
 *   courseId: 'abc-123',
 *   query: 'quantum computing advanced',
 *   reason: 'No documents match the query vector'
 * });
 * ```
 */
export function logRagNoResults(
  ctx: RagContext & {
    query: string;
    reason: string;
  }
): void {
  logger.warn(ctx, `RAG no results: ${ctx.reason}`);
}
