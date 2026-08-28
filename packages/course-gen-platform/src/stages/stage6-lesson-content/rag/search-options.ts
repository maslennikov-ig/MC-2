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
import type { LlmCostContext } from '@/shared/metrics/llm-cost';

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
  /**
   * The course each query embedding is charged to.
   *
   * Optional so that `scripts/rag-quality-benchmark.ts` can build the very
   * request the stage sends without inventing a course to bill; the stage
   * always passes one, and the no-anonymous-spend guard is what says so.
   */
  costContext?: LlmCostContext;
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
 *
 * ## Why there is no per-document cap here (measured 2026-08-26/27)
 *
 * This used to send `group_by_document: true, group_size: 2`, so that one
 * uploaded file could not fill a lesson's context. `pnpm benchmark:rag` against
 * the live collection, 31 known-answer pairs:
 *
 *   recall@5    with the cap 0.7419    without 0.9677
 *   MRR         with the cap 0.6237    without 0.7774
 *   candidates  6.25 per query         29.97 per query
 *
 * And the diversity it was buying, counted over a whole lesson's query set
 * rather than one query — the union of up to ten queries is the thing that can
 * actually be dominated:
 *
 *   documents per lesson    with the cap 1.78    without 1.67
 *   lessons from one document      6 of 9              6 of 9
 *
 * 0.11 documents per lesson, for 22.6 points of recall@5. One document already
 * supplied the entire context in two lessons out of three WITH the cap in
 * force: these courses do not hold several documents bearing on the same
 * lesson, so the cap was paying for diversity the corpus cannot supply. The
 * mechanism by which it cost so much is visible per query — grouping reaches
 * deeper to fill each group, discovers more documents, and the best chunk of
 * each newly discovered document outranks the one that answers the question.
 *
 * It was also starving the reranker: `candidateMultiplier` fetches four
 * candidates per kept chunk, and 6.25 candidates is fewer than the seven chunks
 * the reranker is meant to select from them.
 *
 * Grouping is NOT wrong in general and stays where it earns its keep — Stage 4
 * evidence preflight, conflict detection and Stage 5 advisory enrichment all
 * group deliberately, because their job is per-document coverage rather than
 * the single best passage. This decision is about lesson content only, and it
 * reverses `mc2-jz6y0.16` on the owner's authorization (`mc2-zewto`).
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
    ...(input.costContext ? { cost_context: input.costContext } : {}),
    // Stated rather than left to the default, so that the measurement above has
    // something to sit beside. `group_size` is omitted because with grouping
    // off nothing reads it.
    group_by_document: false,
  };
}
