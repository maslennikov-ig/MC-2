/**
 * Qdrant search helper functions
 *
 * @module shared/qdrant/search-helpers
 */

import { createHash } from 'crypto';
import type { ResolvedSearchOptions, SearchFilters } from './search-types';
import type {
  QdrantPointOrScored,
  QdrantChunkPayload,
  QdrantFilterBuilder,
  QdrantMatchCondition,
} from './types';

/**
 * Generates cache key for search results
 */
export function generateSearchCacheKey(queryText: string, options: ResolvedSearchOptions): string {
  const cacheData = {
    query: queryText,
    limit: options.limit,
    threshold: options.score_threshold,
    hybrid: options.enable_hybrid,
    collection: options.collection_name,
    include_payload: options.include_payload,
    priority_boost: options.enable_priority_boost,
    priority_boost_factor: options.priority_boost_factor,
    group_by_document: options.group_by_document,
    group_size: options.group_size,
    // Expansion changes the returned text, and the budget changes how much of
    // it comes back, so both belong to the identity of a cached response. Left
    // out, a caller asking for expanded passages would be served whatever the
    // previous caller happened to ask for.
    expand: options.expand_context?.max_tokens ?? null,
    filters: {
      organization_id: options.filters.organization_id,
      course_id: options.filters.course_id,
      document_ids: options.filters.document_ids
        ? [...options.filters.document_ids].sort()
        : undefined,
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
    chunk_index: payload.chunk_index,
    organization_id: payload.organization_id,
    course_id: payload.course_id,
  };
}
