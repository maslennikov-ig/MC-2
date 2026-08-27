/**
 * The Qdrant request shape Stage 6 lesson retrieval asks for.
 *
 * Split out of `retriever.ts` so that anything measuring this entry point runs
 * the request the stage actually sends rather than a transcription of it. The
 * shape is six coupled decisions — hybrid on, priority boost on, grouped by
 * document, tenant and course scoped, and a per-query limit derived from the
 * reranker's candidate multiplier — and a benchmark that retyped them would be
 * a second surface free to drift from this one. That drift is the exact failure
 * this module exists to prevent: an unreachable dense threshold made "hybrid"
 * search BM25-only for months and no test in the tree could see it.
 *
 * Nothing here talks to Qdrant, Supabase or the reranker, so it can be imported
 * by a script without dragging the stage's dependency graph along.
 *
 * @module stages/stage6-lesson-content/rag/search-options
 */

import type { SearchOptions } from '@/shared/qdrant/search-types';

import { LESSON_RAG_CONFIG, RERANKER_CONFIG } from './constants';

export interface LessonSearchOptionsInput {
  /** Tenant scope; Stage 6 refuses to retrieve without one. */
  organizationId: string;
  courseId: string;
  /** Documents the lesson is allowed to read, when the run narrows them. */
  primaryDocumentIds?: string[];
  /** Chunks the caller wants to end up with, before the reranker discards. */
  targetChunks?: number;
  /** How many queries share the candidate budget. */
  queryCount: number;
  /** CORE/IMPORTANT boost; the stage defaults it on. */
  enablePriorityBoost?: boolean;
  /** Payload is only read back when evidence scope has to be re-checked. */
  includePayload?: boolean;
}

/**
 * How many candidates one query may return.
 *
 * The reranker is a cross-encoder that keeps one candidate in
 * `RERANKER_CONFIG.candidateMultiplier`, so the whole pass fetches that many
 * times the target and each query gets an equal share of it. The `+ 2` is
 * slack for the deduplication that follows: results repeated across queries
 * collapse, and without it a pass could finish short of its own target.
 */
export function lessonCandidateLimit(targetChunks: number, queryCount: number): number {
  const candidateCount = RERANKER_CONFIG.enabled
    ? targetChunks * RERANKER_CONFIG.candidateMultiplier
    : targetChunks;
  return Math.ceil(candidateCount / Math.max(queryCount, 1)) + 2;
}

/**
 * Builds the search options every Stage 6 query is issued with.
 *
 * `score_threshold` is deliberately absent: the two-tier retriever runs the
 * same options at two different thresholds, so the threshold belongs to the
 * pass rather than to the request shape.
 */
export function buildLessonSearchOptions(
  input: LessonSearchOptionsInput
): Omit<SearchOptions, 'score_threshold'> {
  const targetChunks = input.targetChunks ?? LESSON_RAG_CONFIG.TARGET_CHUNKS;
  const filteringByDocs = Boolean(input.primaryDocumentIds && input.primaryDocumentIds.length > 0);

  return {
    limit: lessonCandidateLimit(targetChunks, input.queryCount),
    enable_hybrid: LESSON_RAG_CONFIG.ENABLE_HYBRID,
    enable_priority_boost: input.enablePriorityBoost ?? true,
    filters: {
      organization_id: input.organizationId,
      course_id: input.courseId,
      ...(filteringByDocs && { document_ids: input.primaryDocumentIds }),
    },
    include_payload: input.includePayload ?? false,
    group_by_document: true,
    group_size: 2,
  };
}
