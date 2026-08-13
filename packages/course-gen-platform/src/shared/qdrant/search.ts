/**
 * Qdrant Hybrid Search with Reciprocal Rank Fusion
 *
 * Implements hybrid search combining:
 * - Dense semantic search (Jina-v3 embeddings)
 * - Sparse lexical search (BM25)
 * - Reciprocal Rank Fusion (RRF) for result merging
 *
 * Expected improvement: +7-10pp precision (82% → 89-92%)
 *
 * @module shared/qdrant/search
 */

import { qdrantClient } from './client';
import { COLLECTION_CONFIG } from './create-collection';
import { expandToSiblingContext } from './context-expansion';
import { cache } from '../cache/redis';
import type { QdrantScoredPoint, QdrantPointOrScored, QdrantChunkPayload } from './types';
import type {
  ResolvedSearchOptions,
  SearchResult,
  SearchOptions,
  SearchResponse,
} from './search-types';
import { generateSearchCacheKey, extractPayload } from './search-helpers';
import { denseSearch, hybridSearchWithFallback } from './search-operations';
import { getCollectionStats } from './upload';
import { DENSE_SCORE_THRESHOLD } from './retrieval-thresholds';
import { logger } from '../logger/index.js';

/**
 * Cache TTL for search results (5 minutes = 300 seconds)
 */
const SEARCH_CACHE_TTL = 300;

/**
 * Minimum query length to cache
 */
const MIN_CACHEABLE_QUERY_LENGTH = 3;

/**
 * Default search options
 */
const DEFAULT_SEARCH_OPTIONS: ResolvedSearchOptions = {
  limit: 10,
  score_threshold: DENSE_SCORE_THRESHOLD,
  collection_name: COLLECTION_CONFIG.name,
  enable_hybrid: false,
  include_payload: false,
  filters: {},
  enable_priority_boost: false,
  priority_boost_factor: 0.4,
  group_by_document: false,
  group_size: 2,
};

/**
 * Converts Qdrant point to search result (works with both Point and ScoredPoint)
 */
function toSearchResult(point: QdrantPointOrScored, include_payload: boolean): SearchResult {
  const payload = extractPayload(point);

  // Extract score - ScoredPoint has it, regular Point doesn't (defaults to 0)
  const score = 'score' in point && typeof point.score === 'number' ? point.score : 0;

  return {
    chunk_id: payload.chunk_id,
    parent_chunk_id: payload.parent_chunk_id,
    level: payload.level,
    content: payload.content,
    heading_path: payload.heading_path,
    chapter: payload.chapter,
    section: payload.section,
    document_id: payload.document_id,
    document_name: payload.document_name,
    page_number: payload.page_number,
    page_range: payload.page_range,
    token_count: payload.token_count,
    sibling_chunk_ids: payload.sibling_chunk_ids,
    chunk_index: payload.chunk_index,
    score,
    metadata: {
      has_code: payload.has_code,
      has_formulas: payload.has_formulas,
      has_tables: payload.has_tables,
      has_images: payload.has_images,
    },
    payload: include_payload ? (point.payload as Record<string, unknown>) : undefined,
  };
}

/**
 * Drops results whose text is already present, keeping the best-scoring copy.
 *
 * The same text legitimately exists at more than one point: a document reused
 * across courses, and — until 2026-08-12 — every parent chunk, which carried a
 * byte-identical copy of its only child. A caller asking for five chunks wants
 * five different pieces of evidence, not one piece repeated five times, so the
 * repeats are removed here rather than at each of the six call sites.
 *
 * Results arrive sorted by score, so the first occurrence is the one to keep.
 */
export function dedupeByContent(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];

  for (const result of results) {
    const key = result.content?.trim() ?? '';
    // A chunk with no text carries no evidence, but it is not a duplicate of
    // another empty one in any meaningful sense; leave those alone.
    if (key.length === 0) {
      unique.push(result);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }

  return unique;
}

/**
 * Searches for relevant chunks using semantic or hybrid search
 *
 * Features:
 * - Dense semantic search (Jina-v3 embeddings)
 * - Optional hybrid search (dense + sparse BM25)
 * - Multi-tenancy filtering (organization_id, course_id)
 * - Content filtering (code, formulas, tables, images)
 * - Similarity threshold filtering
 * - Reciprocal Rank Fusion for result merging
 *
 * @param queryText - Search query
 * @param options - Search options
 * @returns Search response with results and metadata
 *
 * @example
 * ```typescript
 * import { searchChunks } from './search';
 *
 * // Basic semantic search
 * const response = await searchChunks('What is machine learning?', {
 *   limit: 10,
 *   score_threshold: DENSE_SCORE_THRESHOLD,
 *   filters: {
 *     course_id: '123e4567-e89b-12d3-a456-426614174000',
 *     organization_id: '987fbc97-4bed-5078-9f07-9141ba07c9f3',
 *   },
 * });
 * ```
 */
export async function searchChunks(
  queryText: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const config = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  config.filters = { ...DEFAULT_SEARCH_OPTIONS.filters, ...options.filters };

  const totalStartTime = Date.now();

  // Generate cache key
  const cacheKey = generateSearchCacheKey(queryText, config);

  // Check if query is cacheable
  const isCacheable = queryText.trim().length >= MIN_CACHEABLE_QUERY_LENGTH;

  // Try to get cached results
  if (isCacheable) {
    try {
      const cached = await cache.get<SearchResponse>(cacheKey);
      if (cached && cached.results && Array.isArray(cached.results)) {
        logger.debug({ queryPreview: queryText.substring(0, 50) }, 'Search cache hit');
        return cached;
      }
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          queryPreview: queryText.substring(0, 100),
        },
        'Cache read error for search, falling back to Qdrant search'
      );
    }
  }

  logger.debug({ queryPreview: queryText.substring(0, 50) }, 'Search cache miss');

  try {
    // Perform search (dense or hybrid)
    let searchResults: QdrantScoredPoint[];
    let fallbackUsed = false;

    if (config.enable_hybrid) {
      const hybridResult = await hybridSearchWithFallback(queryText, config);
      searchResults = hybridResult.points;
      fallbackUsed = hybridResult.fallbackUsed;
    } else {
      searchResults = await denseSearch(queryText, config);
    }

    // Convert to search results
    const rawResults = searchResults.map(point => toSearchResult(point, config.include_payload));
    const deduped = dedupeByContent(rawResults);

    // Search finds the small grain; the caller is answered with the large one.
    // Opt-in, because only the caller knows its prompt budget.
    const results = config.expand_context
      ? await expandToSiblingContext(deduped, {
          collectionName: config.collection_name,
          maxTokens: config.expand_context.max_tokens,
        })
      : deduped;

    if (deduped.length < rawResults.length) {
      logger.debug(
        {
          returned: rawResults.length,
          unique: deduped.length,
          dropped: rawResults.length - deduped.length,
          queryPreview: queryText.substring(0, 100),
        },
        'Dropped duplicate chunk text from search results'
      );
    }

    const totalTime = Date.now() - totalStartTime;

    const response: SearchResponse = {
      results,
      metadata: {
        total_results: results.length,
        search_type: config.enable_hybrid ? 'hybrid' : 'dense',
        embedding_time_ms: totalTime,
        search_time_ms: totalTime,
        filters_applied: config.filters,
        fallback_used: fallbackUsed,
      },
    };

    // An empty result set is indistinguishable from "no relevant content" at
    // the call site, so say which one it is. The dev Qdrant has held zero
    // points since the move to self-hosted, which means every RAG lookup there
    // returns nothing at all while looking exactly like a legitimate miss.
    if (results.length === 0) {
      const pointsInCollection = await getCollectionStats(config.collection_name)
        .then(stats => stats.points_count)
        .catch(() => null);
      logger.warn(
        {
          queryPreview: queryText.substring(0, 100),
          filters: config.filters,
          searchType: config.enable_hybrid ? 'hybrid' : 'dense',
          pointsInCollection,
          collection: config.collection_name,
        },
        pointsInCollection === 0
          ? 'RAG search returned nothing because the collection is empty - embeddings were never uploaded to this environment'
          : 'RAG search returned no results for a non-empty collection'
      );
    }

    // Cache the response if cacheable
    if (isCacheable) {
      try {
        await cache.set(cacheKey, response, { ttl: SEARCH_CACHE_TTL });
        logger.debug({ ttlSeconds: SEARCH_CACHE_TTL }, 'Search results cached');
      } catch (error) {
        logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            queryPreview: queryText.substring(0, 100),
          },
          'Cache write error for search results, continuing without caching'
        );
      }
    }

    return response;
  } catch (error) {
    throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets the chunks that sit alongside a chunk in the same passage.
 *
 * `getParentChunk` used to live here. It looked the parent up as a point in
 * Qdrant, and parents are no longer indexed (spec 027), so it could only ever
 * return null — a trap for whoever called it first. Reconstructing the passage
 * from siblings replaces it; see `expandToSiblingContext`.
 */
export async function getSiblingChunks(
  chunkId: string,
  collectionName: string = COLLECTION_CONFIG.name
): Promise<SearchResult[]> {
  try {
    // Get chunk
    const chunkResults = await qdrantClient.scroll(collectionName, {
      filter: {
        must: [{ key: 'chunk_id', match: { value: chunkId } }],
      },
      limit: 1,
      with_payload: true,
    });

    if (!chunkResults.points || chunkResults.points.length === 0) {
      return [];
    }

    const payload = chunkResults.points[0].payload as Partial<QdrantChunkPayload>;
    const siblingIds = payload?.sibling_chunk_ids || [];

    if (!Array.isArray(siblingIds) || siblingIds.length === 0) {
      return [];
    }

    // Get siblings
    const siblingResults = await qdrantClient.scroll(collectionName, {
      filter: {
        must: [{ key: 'chunk_id', match: { any: siblingIds } }],
      },
      limit: siblingIds.length,
      with_payload: true,
    });

    return (siblingResults.points || []).map(point => toSearchResult(point, true));
  } catch (error) {
    throw new Error(
      `Failed to get sibling chunks: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Invalidates search cache for a specific course
 */
export function invalidateSearchCacheForCourse(courseId: string): void {
  try {
    logger.info({ courseId }, 'Search cache invalidation requested for course');
    logger.debug(
      {
        message: 'Current implementation does not track keys by course_id',
        note: 'Cache entries will expire naturally after TTL',
      },
      'Cache invalidation note'
    );
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
        courseId,
      },
      'Error invalidating search cache'
    );
  }
}

// Re-export types for convenience
export type {
  SearchResult,
  SearchOptions,
  SearchFilters,
  SearchResponse,
  SearchMetadata,
  ResolvedSearchOptions,
} from './search-types';
