/**
 * Qdrant search operations
 *
 * @module shared/qdrant/search-operations
 */

import { qdrantClient } from './client';
import { generateQueryEmbedding } from '../embeddings/generate';
import { getGlobalBM25Scorer } from '../embeddings/bm25';
import type { SearchOptions, SearchFilters } from './search-types';
import type { QdrantScoredPoint } from './types';
import { buildQdrantFilter, reciprocalRankFusion } from './search-helpers';
import { logger } from '../logger/index.js';

/**
 * Performs dense semantic search using Jina-v3 embeddings
 */
export async function denseSearch(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  // Generate query embedding
  const embeddingStartTime = Date.now();
  const queryVector = await generateQueryEmbedding(queryText);
  const embeddingTime = Date.now() - embeddingStartTime;

  logger.debug({ embeddingTimeMs: embeddingTime }, 'Query embedding generated');

  // Build filter
  const filter = buildQdrantFilter(options.filters);

  // Search Qdrant using named vector 'dense'
  const searchStartTime = Date.now();
  const searchResults = await qdrantClient.search(options.collection_name, {
    vector: {
      name: 'dense',
      vector: queryVector,
    },
    filter,
    limit: options.limit,
    score_threshold: options.score_threshold,
    with_payload: true,
  });
  const searchTime = Date.now() - searchStartTime;

  logger.info({ searchTimeMs: searchTime, resultCount: searchResults.length }, 'Dense search completed');

  return searchResults;
}

/**
 * Performs sparse BM25 search for lexical matching
 */
export async function sparseSearch(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  // Generate sparse vector using BM25
  const bm25Scorer = getGlobalBM25Scorer();
  const querySparseVector = bm25Scorer.generateSparseVector(queryText);

  logger.debug({ termCount: querySparseVector.indices.length }, 'Query sparse vector generated');

  // Build filter
  const filter = buildQdrantFilter(options.filters);

  // Search Qdrant using named vector 'sparse'
  const searchStartTime = Date.now();
  const searchResults = await qdrantClient.search(options.collection_name, {
    vector: {
      name: 'sparse',
      vector: querySparseVector,
    },
    filter,
    limit: options.limit,
    with_payload: true,
  });
  const searchTime = Date.now() - searchStartTime;

  logger.info({ searchTimeMs: searchTime, resultCount: searchResults.length }, 'Sparse search completed');

  return searchResults;
}

/**
 * Performs hybrid search using Qdrant's native Query API with server-side RRF
 *
 * Key difference from client-side RRF:
 * - Uses Qdrant's `query()` method with `prefetch` for server-side RRF fusion
 * - Applies score_threshold ONLY to dense prefetch (pre-fusion filtering)
 * - Uses limit (top-K) for final results, NOT score_threshold (post-fusion)
 *
 * Why this matters:
 * - RRF scores are tiny (max ~0.033 with k=60)
 * - Score thresholds like 0.25 would filter out ALL results if applied post-fusion
 * - Server-side RRF is more efficient (single round-trip)
 */
export async function hybridSearchNative(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  // Generate both vectors in parallel
  const [queryVector, sparseVector] = await Promise.all([
    generateQueryEmbedding(queryText),
    Promise.resolve(getGlobalBM25Scorer().generateSparseVector(queryText)),
  ]);

  const filter = buildQdrantFilter(options.filters);
  const prefetchLimit = Math.max(options.limit * 3, 30); // Fetch more for better RRF

  logger.debug({
    sparseTermCount: sparseVector.indices.length,
    prefetchLimit,
    scoreThreshold: options.score_threshold,
  }, 'Preparing native hybrid search');

  // Use Qdrant's native query API with prefetch for server-side RRF
  const results = await qdrantClient.query(options.collection_name, {
    prefetch: [
      {
        query: {
          values: sparseVector.values,
          indices: sparseVector.indices,
        },
        using: 'sparse',
        limit: prefetchLimit,
        filter,
        // No score_threshold for sparse (BM25 scores are not comparable)
      },
      {
        query: queryVector,
        using: 'dense',
        limit: prefetchLimit,
        filter,
        score_threshold: options.score_threshold, // Apply to dense ONLY (pre-fusion)
      },
    ],
    query: { fusion: 'rrf' },
    limit: options.limit, // Top-K, NOT score_threshold (RRF scores are tiny)
    with_payload: true,
  });

  logger.info({
    resultCount: results.points.length,
    method: 'native-rrf',
  }, 'Native hybrid search completed');

  return results.points as QdrantScoredPoint[];
}

/**
 * Hybrid search with graceful fallback to dense-only search
 *
 * Tries native hybrid search first, falls back to dense-only if:
 * - Hybrid returns 0 results (sparse vectors may be missing)
 * - Any error occurs during hybrid search
 */
export async function hybridSearchWithFallback(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  try {
    const results = await hybridSearchNative(queryText, options);

    // If hybrid returned results, use them
    if (results.length > 0) {
      logger.debug({ count: results.length }, 'Hybrid search returned results');
      return results;
    }

    // Fallback to dense-only if hybrid returns empty
    logger.info({}, 'Hybrid search empty, falling back to dense-only');
    return denseSearch(queryText, options);
  } catch (error) {
    // On any error, fallback to dense-only
    logger.warn({ error: error instanceof Error ? error.message : String(error) },
      'Hybrid search failed, falling back to dense-only');
    return denseSearch(queryText, options);
  }
}

/**
 * Performs hybrid search (dense + sparse with RRF)
 *
 * Now uses Qdrant's native Query API for server-side RRF fusion
 * with automatic fallback to dense-only search.
 *
 * @deprecated Use hybridSearchNative() for direct access to native RRF,
 *             or hybridSearchWithFallback() for explicit fallback behavior.
 */
export async function hybridSearch(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  logger.info({ method: 'native-RRF', queryText: queryText.slice(0, 50) }, 'Performing hybrid search');
  return hybridSearchWithFallback(queryText, options);
}

/**
 * Performs hybrid search using client-side RRF (legacy implementation)
 *
 * @deprecated Use hybridSearchNative() instead. This function applies
 *             score_threshold AFTER RRF fusion, which is incorrect because
 *             RRF scores are tiny (max ~0.033 with k=60).
 */
export async function hybridSearchClientSideRRF(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  logger.info({ method: 'client-RRF', queryText }, 'Performing hybrid search (client-side RRF)');

  // Increase limit for each search to ensure good RRF merging
  const searchLimit = options.limit * 2;
  const searchOptions = { ...options, limit: searchLimit };

  // Perform both searches in parallel for efficiency
  const [denseResults, sparseResults] = await Promise.all([
    denseSearch(queryText, searchOptions),
    sparseSearch(queryText, searchOptions),
  ]);

  logger.debug({
    denseCount: denseResults.length,
    sparseCount: sparseResults.length
  }, 'Search results obtained');

  // Merge results using Reciprocal Rank Fusion
  const mergedResults = reciprocalRankFusion(denseResults, sparseResults);

  logger.info({ mergedCount: mergedResults.length }, 'RRF merge completed');

  // Return top N results after merging
  return mergedResults.slice(0, options.limit);
}
