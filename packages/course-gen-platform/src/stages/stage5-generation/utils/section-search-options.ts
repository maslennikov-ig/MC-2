/**
 * The Qdrant request shape Stage 5 section retrieval asks for.
 *
 * Split out of `section-rag-retriever.ts` for the same reason as the Stage 6
 * copy next door: a measurement of this entry point has to send the request the
 * stage sends, not a transcription that is free to drift from it.
 *
 * Stage 5 and Stage 6 ask for genuinely different things — Stage 5 takes 25
 * chunks against a 40K budget with no priority boost and no grouping, Stage 6
 * takes 7 against 20K with both — so these stay two builders rather than one
 * parameterised one. What they share is the threshold, and that already lives
 * in `shared/qdrant/retrieval-thresholds.ts`.
 *
 * Nothing here talks to Qdrant, Supabase or the reranker.
 *
 * @module stages/stage5-generation/utils/section-search-options
 */

import { DENSE_SCORE_THRESHOLD } from '@/shared/qdrant/retrieval-thresholds';
import type { SearchOptions } from '@/shared/qdrant/search-types';

/**
 * Default configuration for section-level RAG retrieval
 */
export const SECTION_RAG_DEFAULTS = {
  /** Target number of chunks (middle of 20-30 range) */
  TARGET_CHUNKS: 25,
  /** Maximum chunks to retrieve */
  MAX_CHUNKS: 30,
  /** Minimum chunks for acceptable coverage */
  MIN_CHUNKS: 20,
  /** Minimum dense similarity score threshold */
  SCORE_THRESHOLD: DENSE_SCORE_THRESHOLD,
  /** Maximum token budget for RAG context */
  MAX_TOKENS: 40_000,
  /** Enable hybrid search (dense + sparse) - ENABLED: sparse vectors now uploaded + native Query API with server-side RRF */
  ENABLE_HYBRID: true,
  /** Chunks per query to request (may return fewer after deduplication) */
  CHUNKS_PER_QUERY: 15,
} as const;

/**
 * Reranker configuration for improving retrieval quality
 */
export const SECTION_RERANKER_CONFIG = {
  /** Enable reranking with Jina Reranker v2 */
  enabled: true,
  /** Fetch N times more candidates for reranking (100 total for 25 target) */
  candidateMultiplier: 4,
  /** Use Qdrant scores if reranker fails */
  fallbackOnError: true,
} as const;

/**
 * How many candidates one section query may return.
 *
 * With reranking on, the whole pass fetches `candidateMultiplier` times the
 * target and the queries share it; with it off, each query takes the flat
 * `CHUNKS_PER_QUERY`.
 *
 * The collection runs `strict_mode_config.max_query_limit = 100`, so a section
 * plan that carries a single query already sits exactly on that ceiling
 * (25 * 4 / 1); anything that raises `TARGET_CHUNKS` or the multiplier without
 * raising the plan's query count is rejected by Qdrant rather than merely
 * being slow.
 */
export function sectionCandidateLimit(targetChunks: number, queryCount: number): number {
  if (!SECTION_RERANKER_CONFIG.enabled) return SECTION_RAG_DEFAULTS.CHUNKS_PER_QUERY;
  return Math.ceil(
    (targetChunks * SECTION_RERANKER_CONFIG.candidateMultiplier) / Math.max(queryCount, 1)
  );
}

export interface SectionSearchOptionsInput {
  courseId: string;
  /** Documents Stage 4 ranked for this section, when it named any. */
  primaryDocuments?: string[];
  scoreThreshold: number;
  limit: number;
}

/** Builds the search options every Stage 5 section query is issued with. */
export function buildSectionSearchOptions(input: SectionSearchOptionsInput): SearchOptions {
  const { courseId, primaryDocuments, scoreThreshold, limit } = input;

  return {
    limit,
    score_threshold: scoreThreshold,
    enable_hybrid: SECTION_RAG_DEFAULTS.ENABLE_HYBRID,
    filters: {
      course_id: courseId,
      // Filter by primary documents if specified
      ...(primaryDocuments && primaryDocuments.length > 0
        ? { document_ids: primaryDocuments }
        : {}),
    },
  };
}
