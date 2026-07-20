/**
 * Qdrant search operations.
 *
 * Native hybrid retrieval is executed entirely by Qdrant: multilingual BM25
 * and dense candidates are fused with RRF, then optionally re-ranked by a
 * Formula Query. Application code never mutates returned scores.
 *
 * @module shared/qdrant/search-operations
 */

import type { Schemas } from '@qdrant/js-client-rest';
import { qdrantClient } from './client';
import { generateQueryEmbedding } from '../embeddings/generate';
import type { ResolvedSearchOptions } from './search-types';
import type { QdrantScoredPoint } from './types';
import { buildQdrantFilter } from './search-helpers';
import { logger } from '../logger/index.js';
import { createBm25Document } from './config';
import { recordHybridSearchOutcome } from './metrics-textfile';

const MIN_PREFETCH_LIMIT = 30;
const PREFETCH_LIMIT_MULTIPLIER = 3;

export interface HybridSearchOutcome {
  points: QdrantScoredPoint[];
  fallbackUsed: boolean;
}

function getPrefetchLimit(limit: number): number {
  return Math.max(limit * PREFETCH_LIMIT_MULTIPLIER, MIN_PREFETCH_LIMIT);
}

/** Build the two candidate sources consumed by server-side RRF. */
export function buildHybridPrefetch(
  queryText: string,
  denseVector: number[],
  options: ResolvedSearchOptions
): Schemas['Prefetch'][] {
  const filter = buildQdrantFilter(options.filters);
  const limit = getPrefetchLimit(options.limit);

  return [
    {
      query: createBm25Document(queryText),
      using: 'sparse',
      limit,
      filter,
    },
    {
      query: denseVector,
      using: 'dense',
      limit,
      filter,
      score_threshold: options.score_threshold,
    },
  ];
}

/**
 * Build the approved server-side priority formula.
 *
 * Qdrant 1.18.2 has no clamp/min/max expression. Q3 validates stored values
 * in [0.5, 1.0]; Formula defaults cover only a missing payload field.
 */
export function buildPriorityFormula(boostFactor: number): Schemas['FormulaQuery'] {
  return {
    formula: {
      mult: [
        '$score',
        {
          sum: [1, { mult: [{ sum: ['document_weight', -0.5] }, boostFactor] }],
        },
      ],
    },
    defaults: { document_weight: 0.5 },
  };
}

/** Flatten Qdrant document groups by rank across groups, capped to caller limit. */
export function flattenDocumentGroups(
  groups: Schemas['GroupsResult']['groups'],
  limit: number
): QdrantScoredPoint[] {
  if (limit <= 0 || groups.length === 0) return [];

  const flattened: QdrantScoredPoint[] = [];
  const maxGroupSize = Math.max(...groups.map(group => group.hits.length));

  for (let hitIndex = 0; hitIndex < maxGroupSize && flattened.length < limit; hitIndex += 1) {
    for (const group of groups) {
      const hit = group.hits[hitIndex];
      if (hit) flattened.push(hit);
      if (flattened.length === limit) break;
    }
  }

  return flattened;
}

/** Performs dense semantic search using Jina-v3 embeddings. */
export async function denseSearch(
  queryText: string,
  options: ResolvedSearchOptions
): Promise<QdrantScoredPoint[]> {
  const embeddingStartTime = Date.now();
  const queryVector = await generateQueryEmbedding(queryText);
  const embeddingTime = Date.now() - embeddingStartTime;
  const filter = buildQdrantFilter(options.filters);

  logger.debug({ embeddingTimeMs: embeddingTime }, 'Query embedding generated');

  const searchStartTime = Date.now();
  let searchResults: QdrantScoredPoint[];

  if (options.enable_priority_boost) {
    const results = await qdrantClient.query(options.collection_name, {
      prefetch: {
        query: queryVector,
        using: 'dense',
        filter,
        score_threshold: options.score_threshold,
        limit: getPrefetchLimit(options.limit),
      },
      query: buildPriorityFormula(options.priority_boost_factor),
      limit: options.limit,
      with_payload: true,
    });
    searchResults = results.points;
  } else {
    searchResults = await qdrantClient.search(options.collection_name, {
      vector: { name: 'dense', vector: queryVector },
      filter,
      limit: options.limit,
      score_threshold: options.score_threshold,
      with_payload: true,
    });
  }

  logger.info(
    { searchTimeMs: Date.now() - searchStartTime, resultCount: searchResults.length },
    'Dense search completed'
  );

  return searchResults;
}

/** Performs sparse search through Qdrant-native multilingual BM25 inference. */
export async function sparseSearch(
  queryText: string,
  options: ResolvedSearchOptions
): Promise<QdrantScoredPoint[]> {
  const filter = buildQdrantFilter(options.filters);
  const searchStartTime = Date.now();
  const searchResults = await qdrantClient.query(options.collection_name, {
    query: createBm25Document(queryText),
    using: 'sparse',
    filter,
    limit: options.limit,
    with_payload: true,
  });

  logger.info(
    { searchTimeMs: Date.now() - searchStartTime, resultCount: searchResults.points.length },
    'Sparse search completed'
  );

  return searchResults.points;
}

/** Performs native BM25+dense retrieval, RRF, optional Formula and grouping. */
export async function hybridSearchNative(
  queryText: string,
  options: ResolvedSearchOptions
): Promise<QdrantScoredPoint[]> {
  const queryVector = await generateQueryEmbedding(queryText);
  const prefetch = buildHybridPrefetch(queryText, queryVector, options);
  const prefetchLimit = getPrefetchLimit(options.limit);
  const rrfQuery: Schemas['RrfQuery'] = { rrf: {} };

  const rankedRequest = options.enable_priority_boost
    ? {
        prefetch: { prefetch, query: rrfQuery, limit: prefetchLimit },
        query: buildPriorityFormula(options.priority_boost_factor),
      }
    : { prefetch, query: rrfQuery };

  logger.debug(
    {
      prefetchLimit,
      scoreThreshold: options.score_threshold,
      priorityBoost: options.enable_priority_boost,
      grouped: options.group_by_document,
    },
    'Preparing native hybrid search'
  );

  if (options.group_by_document) {
    const grouped = await qdrantClient.queryGroups(options.collection_name, {
      ...rankedRequest,
      group_by: 'document_id',
      group_size: options.group_size,
      limit: options.limit,
      with_payload: true,
    });
    const points = flattenDocumentGroups(grouped.groups, options.limit);
    logger.info(
      { resultCount: points.length, groupCount: grouped.groups.length, method: 'native-rrf' },
      'Grouped native hybrid search completed'
    );
    return points;
  }

  const results = await qdrantClient.query(options.collection_name, {
    ...rankedRequest,
    limit: options.limit,
    with_payload: true,
  });

  logger.info(
    { resultCount: results.points.length, method: 'native-rrf' },
    'Native hybrid search completed'
  );
  return results.points;
}

/** Native hybrid search with explicit dense-only degradation metadata. */
export async function hybridSearchWithFallback(
  queryText: string,
  options: ResolvedSearchOptions
): Promise<HybridSearchOutcome> {
  const recordOutcome = async (fallbackUsed: boolean): Promise<void> => {
    try {
      await recordHybridSearchOutcome(fallbackUsed);
    } catch (metricsError) {
      logger.warn(
        { error: metricsError instanceof Error ? metricsError.message : String(metricsError) },
        'Qdrant hybrid metrics update failed'
      );
    }
  };

  let points: QdrantScoredPoint[];
  try {
    points = await hybridSearchNative(queryText, options);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Hybrid search failed, falling back to dense-only'
    );
    await recordOutcome(true);
    return {
      points: await denseSearch(queryText, { ...options, enable_priority_boost: false }),
      fallbackUsed: true,
    };
  }

  if (points.length > 0) {
    logger.debug({ count: points.length }, 'Hybrid search returned results');
    await recordOutcome(false);
    return { points, fallbackUsed: false };
  }

  logger.info({}, 'Hybrid search empty, falling back to dense-only');
  await recordOutcome(true);
  return { points: await denseSearch(queryText, options), fallbackUsed: true };
}

/** @deprecated Use hybridSearchWithFallback() to retain fallback metadata. */
export async function hybridSearch(
  queryText: string,
  options: ResolvedSearchOptions
): Promise<QdrantScoredPoint[]> {
  logger.info(
    { method: 'native-RRF', queryText: queryText.slice(0, 50) },
    'Performing hybrid search'
  );
  const result = await hybridSearchWithFallback(queryText, options);
  return result.points;
}
