/**
 * The three retrieval entry points, driven through their own request builders.
 *
 * Each entry point is defined by the options it sends, and each of those comes
 * from the module the stage itself imports — `buildLessonSearchOptions`,
 * `buildSectionSearchOptions`, and `searchChunks`' own defaults. Nothing here
 * retypes a limit, a filter or a flag. A benchmark that reimplements the query
 * builds a second surface, and a second surface is free to keep working while
 * the first one breaks; that is precisely how an unreachable dense threshold
 * turned "hybrid" search into BM25-only search for months without a single test
 * noticing.
 *
 * @module shared/rag-eval/entry-points
 */

import type { SearchOptions } from '../qdrant/search-types';
import { COLLECTION_CONFIG } from '../qdrant/create-collection';
import {
  buildSectionSearchOptions,
  sectionCandidateLimit,
  SECTION_RAG_DEFAULTS,
} from '../../stages/stage5-generation/utils/section-search-options';
import {
  buildLessonSearchOptions,
  lessonCandidateLimit,
} from '../../stages/stage6-lesson-content/rag/search-options';
import { LESSON_RAG_CONFIG } from '../../stages/stage6-lesson-content/rag/constants';
import { DENSE_SCORE_THRESHOLD } from '../qdrant/retrieval-thresholds';
import type { EvalQuery } from './eval-set';

export type EntryPointKey = 'stage5' | 'stage6' | 'search_documents';

export interface EntryPoint {
  key: EntryPointKey;
  /** What the report calls it. */
  label: string;
  /** The threshold this entry point runs at when nothing overrides it. */
  defaultThreshold: number;
  /**
   * Tokens expansion may add, or `null` where the entry point does not expand.
   *
   * Stage 5 and Stage 6 expand after reranking rather than inside the search
   * call, so the number is theirs even though the option is not set here.
   */
  expansionBudget: number | null;
  buildOptions(query: EvalQuery, threshold: number): SearchOptions;
}

/**
 * One query per lesson, which is what the measurement issues.
 *
 * Stage 6 divides its candidate budget across the queries a lesson produced, so
 * the per-query limit depends on how many there were. The benchmark scores one
 * query at a time, so it asks for the budget a single-query lesson would get —
 * the widest request the stage can make, and therefore the one whose ranking is
 * least truncated by the split.
 */
const BENCHMARK_QUERY_COUNT = 1;

export const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    key: 'stage5',
    label: 'Stage 5 section retrieval',
    defaultThreshold: SECTION_RAG_DEFAULTS.SCORE_THRESHOLD,
    expansionBudget: SECTION_RAG_DEFAULTS.MAX_TOKENS,
    buildOptions: (query, threshold) =>
      buildSectionSearchOptions({
        courseId: query.course_id,
        ...(query.document_ids ? { primaryDocuments: query.document_ids } : {}),
        scoreThreshold: threshold,
        limit: sectionCandidateLimit(SECTION_RAG_DEFAULTS.TARGET_CHUNKS, BENCHMARK_QUERY_COUNT),
      }),
  },
  {
    key: 'stage6',
    label: 'Stage 6 lesson retrieval',
    defaultThreshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
    expansionBudget: LESSON_RAG_CONFIG.MAX_TOKENS,
    buildOptions: (query, threshold) => ({
      ...buildLessonSearchOptions({
        organizationId: query.organization_id,
        courseId: query.course_id,
        ...(query.document_ids ? { primaryDocumentIds: query.document_ids } : {}),
        queryCount: BENCHMARK_QUERY_COUNT,
      }),
      score_threshold: threshold,
    }),
  },
  {
    key: 'search_documents',
    label: 'search_documents (shared defaults)',
    defaultThreshold: DENSE_SCORE_THRESHOLD,
    expansionBudget: null,
    // `searchChunks` fills in every other default itself, and that is the point:
    // this entry point is defined by what a caller gets when it asks for nothing
    // beyond a tenant scope. Notably it gets `enable_hybrid: false`.
    buildOptions: (query, threshold) => ({
      score_threshold: threshold,
      filters: {
        organization_id: query.organization_id,
        course_id: query.course_id,
        ...(query.document_ids ? { document_ids: query.document_ids } : {}),
      },
    }),
  },
] as const;

export function entryPoint(key: EntryPointKey): EntryPoint {
  const found = ENTRY_POINTS.find(candidate => candidate.key === key);
  if (!found) throw new Error(`Unknown retrieval entry point: ${key}`);
  return found;
}

/** How many results an entry point asks Qdrant for, after its own defaults. */
export function entryPointLimit(point: EntryPoint, query: EvalQuery): number {
  const options = point.buildOptions(query, point.defaultThreshold);
  return options.limit ?? 10;
}

export { COLLECTION_CONFIG, lessonCandidateLimit };
