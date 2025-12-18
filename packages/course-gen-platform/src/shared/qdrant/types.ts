/**
 * Qdrant type definitions
 *
 * These types provide type-safe wrappers around Qdrant client responses
 * to avoid using `any` in the codebase.
 */

import type { Schemas } from '@qdrant/js-client-rest';

/**
 * Qdrant scored point (search result)
 */
export type QdrantScoredPoint = Schemas['ScoredPoint'];

/**
 * Qdrant point with payload
 */
export type QdrantPoint = Schemas['Record'];

/**
 * Qdrant point or scored point (union type for flexibility)
 */
export type QdrantPointOrScored = QdrantPoint | QdrantScoredPoint;

/**
 * Qdrant filter condition
 */
export type QdrantFilter = Schemas['Filter'];

/**
 * Qdrant filter must conditions
 */
export type QdrantFilterMust = Schemas['Filter']['must'];

/**
 * Qdrant scroll result
 */
export interface QdrantScrollResult {
  points: QdrantPoint[];
  next_page_offset?: string | number | null;
}

/**
 * Type guard to check if a point has a score (is ScoredPoint)
 */
export function isScoredPoint(point: QdrantPointOrScored): point is QdrantScoredPoint {
  return 'score' in point && typeof point.score === 'number';
}

/**
 * Qdrant payload (chunk metadata)
 */
export interface QdrantChunkPayload {
  chunk_id: string;
  parent_chunk_id?: string | null;
  level: 'parent' | 'child';
  content: string;
  heading_path: string;
  chapter?: string | null;
  section?: string | null;
  document_id: string;
  document_name: string;
  page_number?: number | null;
  page_range?: [number, number] | null;
  token_count: number;
  has_code?: boolean;
  has_formulas?: boolean;
  has_tables?: boolean;
  has_images?: boolean;
  sibling_chunk_ids?: string[];
  organization_id?: string;
  course_id?: string;
  [key: string]: unknown;
}

/**
 * Type guard for Qdrant chunk payload
 */
export function isQdrantChunkPayload(payload: unknown): payload is QdrantChunkPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.chunk_id === 'string' &&
    typeof p.content === 'string' &&
    typeof p.heading_path === 'string' &&
    typeof p.document_id === 'string' &&
    typeof p.document_name === 'string'
  );
}

/**
 * Qdrant filter match condition
 */
export interface QdrantMatchCondition {
  key: string;
  match: {
    value?: string | number | boolean;
    any?: (string | number)[];
  };
}

/**
 * Helper to build Qdrant filter
 */
export interface QdrantFilterBuilder {
  must?: QdrantMatchCondition[];
}
