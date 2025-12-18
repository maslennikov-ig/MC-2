/**
 * Qdrant search helper functions
 *
 * @module shared/qdrant/search-helpers
 */

import { createHash } from 'crypto';
import type { SearchOptions, SearchFilters } from './search-types';
import type {
  QdrantScoredPoint,
  QdrantPointOrScored,
  QdrantChunkPayload,
  QdrantFilterBuilder,
  QdrantMatchCondition,
} from './types';

/**
 * Generates cache key for search results
 */
export function generateSearchCacheKey(
  queryText: string,
  options: Required<Omit<SearchOptions, 'filters'>> & { filters: SearchFilters }
): string {
  const cacheData = {
    query: queryText.toLowerCase().trim(),
    limit: options.limit,
    threshold: options.score_threshold,
    hybrid: options.enable_hybrid,
    collection: options.collection_name,
    filters: {
      organization_id: options.filters.organization_id,
      course_id: options.filters.course_id,
      document_ids: options.filters.document_ids?.sort(),
      level: options.filters.level,
      chapter: options.filters.chapter,
      section: options.filters.section,
      has_code: options.filters.has_code,
      has_formulas: options.filters.has_formulas,
      has_tables: options.filters.has_tables,
      has_images: options.filters.has_images,
    },
  };

  const hash = createHash('sha256').update(JSON.stringify(cacheData)).digest('hex');
  return `search:${hash}`;
}

/**
 * Builds Qdrant filter from search filters
 */
export function buildQdrantFilter(filters: SearchFilters): QdrantFilterBuilder | undefined {
  const must: QdrantMatchCondition[] = [];

  // Multi-tenancy filters
  if (filters.organization_id) {
    must.push({
      key: 'organization_id',
      match: { value: filters.organization_id },
    });
  }

  if (filters.course_id) {
    must.push({
      key: 'course_id',
      match: { value: filters.course_id },
    });
  }

  // Document filters
  if (filters.document_ids && filters.document_ids.length > 0) {
    must.push({
      key: 'document_id',
      match: { any: filters.document_ids },
    });
  }

  // Chunk level filter
  if (filters.level) {
    must.push({
      key: 'level',
      match: { value: filters.level },
    });
  }

  // Hierarchy filters
  if (filters.chapter) {
    must.push({
      key: 'chapter',
      match: { value: filters.chapter },
    });
  }

  if (filters.section) {
    must.push({
      key: 'section',
      match: { value: filters.section },
    });
  }

  // Content metadata filters
  if (filters.has_code !== undefined) {
    must.push({
      key: 'has_code',
      match: { value: filters.has_code },
    });
  }

  if (filters.has_formulas !== undefined) {
    must.push({
      key: 'has_formulas',
      match: { value: filters.has_formulas },
    });
  }

  if (filters.has_tables !== undefined) {
    must.push({
      key: 'has_tables',
      match: { value: filters.has_tables },
    });
  }

  if (filters.has_images !== undefined) {
    must.push({
      key: 'has_images',
      match: { value: filters.has_images },
    });
  }

  return must.length > 0 ? { must } : undefined;
}

/**
 * Extracts payload from Qdrant point safely (works with both Point and ScoredPoint)
 */
export function extractPayload(point: QdrantPointOrScored): QdrantChunkPayload {
  const payload = (point.payload || {}) as Partial<QdrantChunkPayload>;

  return {
    chunk_id: payload.chunk_id || '',
    parent_chunk_id: payload.parent_chunk_id || null,
    level: payload.level || 'child',
    content: payload.content || '',
    heading_path: payload.heading_path || '',
    chapter: payload.chapter || null,
    section: payload.section || null,
    document_id: payload.document_id || '',
    document_name: payload.document_name || '',
    page_number: payload.page_number || null,
    page_range: payload.page_range || null,
    token_count: payload.token_count || 0,
    has_code: payload.has_code || false,
    has_formulas: payload.has_formulas || false,
    has_tables: payload.has_tables || false,
    has_images: payload.has_images || false,
    sibling_chunk_ids: payload.sibling_chunk_ids,
    organization_id: payload.organization_id,
    course_id: payload.course_id,
  };
}

/**
 * Reciprocal Rank Fusion (RRF) result item
 */
interface RRFItem {
  point: QdrantScoredPoint;
  score: number;
  denseRank?: number;
  sparseRank?: number;
}

/**
 * Reciprocal Rank Fusion (RRF) for merging search results
 */
export function reciprocalRankFusion(
  denseResults: QdrantScoredPoint[],
  sparseResults: QdrantScoredPoint[],
  k = 60
): QdrantScoredPoint[] {
  const scoreMap = new Map<string, RRFItem>();

  // Process dense results
  denseResults.forEach((point, rank) => {
    const id = String(point.id);
    const rrfScore = 1 / (k + rank + 1);
    scoreMap.set(id, {
      point,
      score: rrfScore,
      denseRank: rank + 1,
    });
  });

  // Process sparse results
  sparseResults.forEach((point, rank) => {
    const id = String(point.id);
    const rrfScore = 1 / (k + rank + 1);

    if (scoreMap.has(id)) {
      const existing = scoreMap.get(id)!;
      existing.score += rrfScore;
      existing.sparseRank = rank + 1;
    } else {
      scoreMap.set(id, {
        point,
        score: rrfScore,
        sparseRank: rank + 1,
      });
    }
  });

  // Sort by combined RRF score (descending)
  const merged = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);

  // Return points with updated scores
  return merged.map(({ point, score }) => ({
    ...point,
    score,
  }));
}
