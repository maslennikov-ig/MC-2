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
 * Performs hybrid search (dense + sparse with RRF)
 */
export async function hybridSearch(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): Promise<QdrantScoredPoint[]> {
  logger.info({ method: 'RRF', queryText }, 'Performing hybrid search');

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
