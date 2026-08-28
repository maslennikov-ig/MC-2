import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions } from '@/shared/qdrant/search-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import type { RAGChunk as SectionRAGChunk } from '@/stages/stage5-generation/utils/section-rag-retriever';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { assertCourseRagReadyWithRetry } from '@/shared/rag/required-rag-retry';
import { RequiredRagUnavailableError } from '@/shared/rag/document-availability';
import { publishDocumentEvidenceMetricsSafely } from '@/shared/metrics/document-evidence-textfile';

import { LESSON_RAG_CONFIG, RERANKER_CONFIG, TWO_TIER_CONFIG } from './constants';
import { buildLessonSearchOptions } from './search-options';
import type { LessonRAGParams, LessonRAGResult } from './types';
import { generateCacheKey, buildLessonQueries, createEmptyResult } from './helpers';
import { resolveTier1ShadowSelection } from './shadow-retrieval';
import {
  getStage6EvidenceProvenance,
  isStage6EvidenceChunkAllowed,
  Stage6EvidenceScopeError,
  type Stage6AcceptedEvidenceContext,
} from './evidence-context';

function requireTenantScope(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 document retrieval requires an organization tenant scope'
    );
  }
  return organizationId;
}

function assertEvidenceSearchResult(input: {
  result: { chunk_id: string; document_id: string; payload?: Record<string, unknown> };
  courseId: string;
  organizationId: string;
  evidenceContext: Stage6AcceptedEvidenceContext;
}): void {
  const { result, courseId, organizationId, evidenceContext } = input;
  const payload = result.payload;
  if (!evidenceContext.allowedDocumentIds.includes(result.document_id)) {
    throw new Stage6EvidenceScopeError('Stage 6 Qdrant result is outside the accepted run scope');
  }
  if (!payload || payload.organization_id !== organizationId || payload.course_id !== courseId) {
    throw new Stage6EvidenceScopeError('Stage 6 Qdrant result failed tenant/course validation');
  }
  if (payload.version_hash !== evidenceContext.sourceVersionByDocumentId[result.document_id]) {
    throw new Stage6EvidenceScopeError('Stage 6 Qdrant result has a stale source version');
  }
  if (!isStage6EvidenceChunkAllowed(evidenceContext, result.document_id, result.chunk_id)) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 Qdrant result is outside the accepted source-ref/chunk scope'
    );
  }
}

interface Tier1ShadowRetrievalInput {
  courseId: string;
  lessonId: string;
  organizationId: string;
  tier1Queries: string[];
  tier2Queries: string[];
  baseSearchOptions: Omit<SearchOptions, 'score_threshold'>;
  evidenceContext?: Stage6AcceptedEvidenceContext;
  shadowRate: number;
}

async function runTier1ShadowRetrieval(input: Tier1ShadowRetrievalInput): Promise<void> {
  const {
    courseId,
    lessonId,
    organizationId,
    tier1Queries,
    tier2Queries,
    baseSearchOptions,
    evidenceContext,
    shadowRate,
  } = input;
  const startedAt = Date.now();
  const tier2ChunkIds = new Set<string>();
  let tier1DenseMaxScore: number | null = null;
  let queryFailures = 0;

  const observeResponse = (
    response: Awaited<ReturnType<typeof searchChunks>>,
    mode: 'tier1_probe' | 'tier2_shadow'
  ): void => {
    for (const result of response.results) {
      if (evidenceContext) {
        assertEvidenceSearchResult({
          result,
          courseId,
          organizationId,
          evidenceContext,
        });
      }
      if (mode === 'tier1_probe') {
        tier1DenseMaxScore =
          tier1DenseMaxScore === null ? result.score : Math.max(tier1DenseMaxScore, result.score);
      } else {
        tier2ChunkIds.add(result.chunk_id);
      }
    }
  };

  for (const query of tier1Queries) {
    try {
      const response = await searchChunks(query, {
        ...baseSearchOptions,
        limit: 1,
        score_threshold: 0,
        enable_hybrid: false,
        enable_priority_boost: false,
        group_by_document: false,
      });
      observeResponse(response, 'tier1_probe');
    } catch (error) {
      queryFailures += 1;
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          courseId,
          lessonId,
          shadowPhase: 'tier1_probe',
        },
        '[Lesson RAG] Tier 1 shadow score probe failed'
      );
    }
  }

  for (const query of tier2Queries) {
    try {
      const response = await searchChunks(query, {
        ...baseSearchOptions,
        score_threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
      });
      observeResponse(response, 'tier2_shadow');
    } catch (error) {
      queryFailures += 1;
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          courseId,
          lessonId,
          shadowPhase: 'tier2_shadow',
        },
        '[Lesson RAG] Tier 1 shadow Tier 2 query failed'
      );
    }
  }

  const complete = queryFailures === 0;
  try {
    await logTrace({
      courseId,
      lessonId,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      stepName: 'tier1_shadow',
      inputData: {
        lessonId,
        tier1Queries: tier1Queries.length,
        tier2Queries: tier2Queries.length,
        tier1ProbeMode: 'dense_raw',
        tier1ProbeThreshold: 0,
        tier2Threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
      },
      outputData: {
        tier1DenseMaxScore: tier1DenseMaxScore ?? 0,
        tier1DenseScoreObserved: tier1DenseMaxScore !== null,
        tier1DenseProbeFloor: 0,
        tier2ChunksFound: tier2ChunkIds.size,
        falsePositive: complete ? tier2ChunkIds.size > 0 : null,
        shadowRate,
        complete,
        queryFailures,
      },
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        courseId,
        lessonId,
      },
      '[Lesson RAG] Tier 1 shadow trace failed'
    );
  }
}

/**
 * Retrieve RAG context for a single lesson
 *
 * Uses lesson's rag_context specification and learning objectives as queries.
 * Supports caching for retry consistency via ragContextCache.
 *
 * @param params - Lesson retrieval parameters
 * @returns LessonRAGResult with chunks and metrics
 */
import type { RetrievalCollector } from './retrieval-collector';

interface QueryPassInput {
  queries: string[];
  scoreThreshold: number;
  tier: 1 | 2;
  courseId: string;
  lessonId: string;
  organizationId: string;
  baseSearchOptions: Omit<SearchOptions, 'score_threshold'>;
  evidenceContext?: Stage6AcceptedEvidenceContext;
  collector: RetrievalCollector;
  /** Tier 2 stops early once it has enough candidates; the gate never does. */
  stopWhenEnough?: () => boolean;
}

/**
 * Run a list of queries and collect whatever new chunks they return.
 *
 * Tier 1 and Tier 2 ran two copies of this loop that differed only in the score threshold, the
 * number in the log line, and Tier 2's early break — so a fix to one of them silently did not
 * apply to the other.
 *
 * A failed query is counted and survived, because partial retrieval beats none. The one error
 * that is NOT survivable is `Stage6EvidenceScopeError`: it means a result came back from outside
 * the accepted evidence scope, and continuing would write a lesson from a document the run was
 * not allowed to read.
 */
async function runQueryPass(input: QueryPassInput): Promise<void> {
  const {
    queries,
    scoreThreshold,
    tier,
    courseId,
    lessonId,
    organizationId,
    baseSearchOptions,
    evidenceContext,
    collector,
    stopWhenEnough,
  } = input;

  for (const query of queries) {
    try {
      const response = await searchChunks(query, {
        ...baseSearchOptions,
        score_threshold: scoreThreshold,
      });

      for (const result of response.results) {
        if (evidenceContext) {
          assertEvidenceSearchResult({ result, courseId, organizationId, evidenceContext });
        }
        if (collector.seenChunkIds.has(result.chunk_id)) continue;

        collector.seenChunkIds.add(result.chunk_id);
        collector.allChunks.push({
          chunk_id: result.chunk_id,
          document_id: result.document_id,
          document_name: result.document_name,
          content: result.content,
          heading_path: result.heading_path,
          similarity_score: result.score,
          matched_query: query,
          sibling_chunk_ids: result.sibling_chunk_ids,
          parent_chunk_id: result.parent_chunk_id,
          token_count: result.token_count,
        });
        collector.queriesUsed.push(query);
      }

      logger.debug(
        {
          lessonId,
          resultsCount: response.results.length,
          totalUnique: collector.allChunks.length,
          tier,
        },
        `[Lesson RAG] Tier ${tier} query executed`
      );
    } catch (error) {
      if (error instanceof Stage6EvidenceScopeError) throw error;
      collector.queryFailureCount += 1;
      logger.warn(
        { err: error instanceof Error ? error.message : String(error), lessonId, tier },
        tier === 1
          ? '[Lesson RAG] Tier 1 query failed - continuing'
          : '[Lesson RAG] Tier 2 query failed - continuing with remaining queries'
      );
    }

    if (stopWhenEnough?.()) break;
  }
}

/**
 * Reuse a lesson's cached RAG context without touching live Qdrant.
 *
 * The cache is keyed by evidence identity as well as by lesson, but a cache written before the
 * accepted evidence set narrowed can still hold a document that is now out of scope — hence the
 * re-check on read. Returns `null` when there is nothing usable, which is not an error.
 */
async function tryCachedContext(
  params: LessonRAGParams,
  startTime: number
): Promise<LessonRAGResult | null> {
  const { courseId, lessonSpec, useCache = true, evidenceContext } = params;
  if (!useCache || !lessonSpec.rag_context) return null;

  const ragContextId = generateCacheKey(
    courseId,
    lessonSpec.lesson_id,
    evidenceContext?.cacheIdentity
  );
  const cached = await ragContextCache.get(ragContextId);
  if (!cached) return null;

  if (
    evidenceContext &&
    cached.chunks.some(
      chunk => !isStage6EvidenceChunkAllowed(evidenceContext, chunk.documentId, chunk.chunkId)
    )
  ) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 cache contains a document outside the current accepted evidence scope'
    );
  }

  logger.debug(
    { lessonId: lessonSpec.lesson_id, cachedChunks: cached.chunks.length },
    '[Lesson RAG] Using cached context'
  );

  try {
    await logTrace({
      courseId,
      lessonId: lessonSpec.lesson_id,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      stepName: 'lesson_cache_hit',
      inputData: { lessonId: lessonSpec.lesson_id },
      outputData: { chunksFound: cached.chunks.length, cached: true },
      durationMs: Date.now() - startTime,
    });
  } catch {
    // Don't fail on trace error
  }

  const convertedChunks: RAGChunk[] = cached.chunks.map((chunk: SectionRAGChunk) => ({
    chunk_id: chunk.chunkId,
    document_id: chunk.documentId,
    document_name: chunk.documentName,
    content: chunk.content,
    page_or_section: chunk.headingPath,
    relevance_score: chunk.score,
    metadata: {
      matched_query: chunk.matchedQuery,
      ...(evidenceContext && {
        evidence_provenance: getStage6EvidenceProvenance(
          evidenceContext,
          chunk.documentId,
          chunk.chunkId
        ),
      }),
    },
  }));

  return {
    lessonId: lessonSpec.lesson_id,
    chunks: convertedChunks,
    totalRetrieved: cached.chunks.length,
    queriesUsed: cached.searchQueriesUsed,
    coverageScore: cached.coverageScore,
    retrievalDurationMs: Date.now() - startTime,
    cached: true,
  };
}

/**
 * Which documents this lesson is allowed to search, given the accepted evidence set.
 *
 * Returns `null` when the lesson names documents and the accepted evidence names documents and
 * the two do not intersect — meaning the lesson would be written without the user's sources.
 *
 * That case is why this is a separate function rather than an inline branch. It was the one
 * empty-result path that used to say nothing at all: it returned in ~140 ms leaving no line, no
 * trace row and nothing to tell it apart from a course that simply has no documents. On
 * 2026-08-22 a dev run hit it with two chunks sitting indexed in Qdrant, and the branch had to
 * be identified by eliminating the four that DO log (mc2-kznfz). It also sits ABOVE the Tier 1
 * gate, so the shadow cohort that exists to measure silent RAG loss (mc2-wxun) cannot see it.
 */
async function resolveDocumentScope(
  params: LessonRAGParams,
  startTime: number
): Promise<{ primaryDocIds: string[] | undefined } | null> {
  const { courseId, lessonSpec, evidenceContext } = params;
  const specifiedPrimaryDocIds = lessonSpec.rag_context?.primary_documents;

  if (!evidenceContext) return { primaryDocIds: specifiedPrimaryDocIds };

  const primaryDocIds =
    specifiedPrimaryDocIds && specifiedPrimaryDocIds.length > 0
      ? specifiedPrimaryDocIds.filter(documentId =>
          evidenceContext.allowedDocumentIds.includes(documentId)
        )
      : evidenceContext.allowedDocumentIds;

  if (!specifiedPrimaryDocIds || specifiedPrimaryDocIds.length === 0 || primaryDocIds.length > 0) {
    return { primaryDocIds };
  }

  logger.warn(
    {
      courseId,
      lessonId: lessonSpec.lesson_id,
      specifiedPrimaryDocumentCount: specifiedPrimaryDocIds.length,
      allowedDocumentCount: evidenceContext.allowedDocumentIds.length,
      outcome: 'empty',
    },
    '[Lesson RAG] Lesson documents and accepted evidence do not intersect - writing without sources'
  );
  try {
    await logTrace({
      courseId,
      lessonId: lessonSpec.lesson_id,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      stepName: 'evidence_scope_empty',
      inputData: {
        lessonId: lessonSpec.lesson_id,
        specifiedPrimaryDocumentCount: specifiedPrimaryDocIds.length,
        allowedDocumentCount: evidenceContext.allowedDocumentIds.length,
      },
      outputData: { chunksFound: 0, reason: 'lesson_documents_outside_accepted_evidence' },
      durationMs: Date.now() - startTime,
    });
  } catch {
    // Don't fail on trace error
  }
  return null;
}

interface Tier1GateInput {
  courseId: string;
  lessonId: string;
  organizationId: string;
  queries: string[];
  tier1Queries: string[];
  tier2Queries: string[];
  baseSearchOptions: Omit<SearchOptions, 'score_threshold'>;
  evidenceContext?: Stage6AcceptedEvidenceContext;
  collector: RetrievalCollector;
  ragRequired: boolean;
}

/**
 * Tier 1 (Light Gate): run the first N queries at a permissive threshold, and if ALL of them
 * come back empty, stop here.
 *
 * Saves ~65% of Qdrant queries and ~75% of Jina Reranker calls on lessons the documents do not
 * cover. @see docs/plans/dapper-jumping-plum.md
 *
 * Returns `true` when the caller should exit. A sampled share of exits fires a shadow retrieval
 * in the background, which is how silent RAG loss gets measured rather than assumed — and it is
 * deliberately not awaited, because it exists to observe this run, not to delay it.
 */
async function runTier1Gate(input: Tier1GateInput): Promise<boolean> {
  const {
    courseId,
    lessonId,
    organizationId,
    queries,
    tier1Queries,
    tier2Queries,
    baseSearchOptions,
    evidenceContext,
    collector,
    ragRequired,
  } = input;

  const tier1StartTime = Date.now();
  await runQueryPass({
    queries: tier1Queries,
    scoreThreshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
    tier: 1,
    courseId,
    lessonId,
    organizationId,
    baseSearchOptions,
    evidenceContext,
    collector,
  });
  const tier1DurationMs = Date.now() - tier1StartTime;

  // Strike-Two: if ALL Tier 1 queries returned 0 chunks → early exit
  if (collector.allChunks.length > 0) {
    const tier1MaxScore = Math.max(...collector.allChunks.map(chunk => chunk.similarity_score));

    logger.info(
      {
        lessonId,
        tier1ChunksFound: collector.allChunks.length,
        tier1MaxScore: tier1MaxScore.toFixed(3),
        tier1DurationMs,
      },
      '[Lesson RAG] Tier 1 passed - proceeding to Tier 2'
    );

    // Log trace for Tier 1 pass (helps measure false negative rate)
    try {
      await logTrace({
        courseId,
        lessonId,
        stage: 'stage_6',
        phase: 'rag_retrieval',
        stepName: 'tier1_pass',
        inputData: {
          lessonId,
          tier1Queries: tier1Queries.length,
          totalQueries: queries.length,
          tier1Threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
        },
        outputData: {
          tier1ChunksFound: collector.allChunks.length,
          tier1MaxScore,
          tier1Exit: false,
        },
        durationMs: tier1DurationMs,
      });
    } catch {
      // Don't fail on trace error
    }
    return false;
  }

  // Nothing found. If evidence was REQUIRED and queries failed, this is an outage, not an answer.
  if (ragRequired && collector.queryFailureCount > 0) {
    throw new RequiredRagUnavailableError(
      courseId,
      'qdrant_service_unavailable',
      'All Stage 6 retrieval queries failed after required-RAG preflight'
    );
  }

  logger.info(
    {
      lessonId,
      courseId,
      tier1Queries: tier1Queries.length,
      tier1DurationMs,
      tier1Threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
    },
    '[Lesson RAG] Tier 1 exit - no results from gate queries (Strike-Two)'
  );

  const shadowSelection = resolveTier1ShadowSelection(courseId, lessonId);
  try {
    await logTrace({
      courseId,
      lessonId,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      stepName: 'tier1_exit',
      inputData: {
        lessonId,
        tier1Queries: tier1Queries.length,
        totalQueries: queries.length,
        tier1Threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
      },
      outputData: {
        tier1ChunksFound: 0,
        tier1Exit: true,
        queriesSaved: tier2Queries.length,
        rerankerSkipped: true,
        shadowSampled: shadowSelection.sampled,
        shadowRate: shadowSelection.rate,
      },
      durationMs: tier1DurationMs,
    });
  } catch {
    // Don't fail on trace error
  }

  if (shadowSelection.sampled) {
    void runTier1ShadowRetrieval({
      courseId,
      lessonId,
      organizationId,
      tier1Queries,
      tier2Queries,
      baseSearchOptions,
      evidenceContext,
      shadowRate: shadowSelection.rate,
    }).catch(error =>
      logger.warn(
        { err: error instanceof Error ? error.message : String(error), courseId, lessonId },
        '[Lesson RAG] Tier 1 shadow retrieval failed'
      )
    );
  }

  return true;
}

// The ranking and assembly half lives next door; it is the part of retrieval that no longer
// talks to Qdrant, only to the reranker, the cache and the trace log.
import { rankAndAssemble } from './retrieval-assembly';

async function retrieveLessonContextCore(
  params: LessonRAGParams
): Promise<LessonRAGResult & { fallbackUsed?: boolean }> {
  const startTime = Date.now();
  const {
    courseId,
    organizationId,
    lessonSpec,
    targetChunks = LESSON_RAG_CONFIG.TARGET_CHUNKS,
    enablePriorityBoost = true, // Default: boost CORE/IMPORTANT documents
    evidenceContext,
  } = params;
  const lessonId = lessonSpec.lesson_id;
  const empty = () => createEmptyResult(lessonId, Date.now() - startTime);

  logger.debug(
    {
      courseId,
      lessonId,
      targetChunks,
      useCache: params.useCache ?? true,
      enablePriorityBoost,
    },
    '[Lesson RAG] Starting retrieval'
  );

  const cached = await tryCachedContext(params, startTime);
  if (cached) return cached;

  // OPTIMIZATION: Check if course has any indexed documents before making Qdrant queries.
  // This prevents ~100s of wasted time when the course has no uploaded documents.
  const ragAvailability = await assertCourseRagReadyWithRetry(courseId);
  if (ragAvailability.availability === 'optional_no_documents') {
    logger.info(
      { courseId, lessonId },
      '[Lesson RAG] Course has no indexed documents, skipping RAG retrieval'
    );
    return empty();
  }

  const tenantOrganizationId = requireTenantScope(organizationId);
  if (evidenceContext && evidenceContext.allowedDocumentIds.length === 0) {
    logger.info(
      { outcome: 'empty', allowedDocumentCount: 0 },
      '[Lesson RAG] Accepted evidence decisions exclude all document refs'
    );
    return empty();
  }

  const queries = buildLessonQueries(lessonSpec);
  if (queries.length === 0) {
    logger.warn({ lessonId }, '[Lesson RAG] No search queries generated');
    return empty();
  }

  const scope = await resolveDocumentScope(params, startTime);
  if (!scope) return empty();
  const { primaryDocIds } = scope;

  // When reranking is enabled, fetch more candidates (4x) for reranking.
  const candidateCount = RERANKER_CONFIG.enabled
    ? targetChunks * RERANKER_CONFIG.candidateMultiplier
    : targetChunks;

  const collector: RetrievalCollector = {
    allChunks: [],
    seenChunkIds: new Set<string>(),
    queriesUsed: [],
    queryFailureCount: 0,
  };

  const filteringByDocs = Boolean(primaryDocIds && primaryDocIds.length > 0);
  const baseSearchOptions: Omit<SearchOptions, 'score_threshold'> = buildLessonSearchOptions({
    organizationId: tenantOrganizationId,
    courseId,
    ...(primaryDocIds ? { primaryDocumentIds: primaryDocIds } : {}),
    targetChunks,
    queryCount: queries.length,
    enablePriorityBoost,
    includePayload: Boolean(evidenceContext),
    // Rides on the base options, so every query this pass issues — Tier 1,
    // Tier 2 and the shadow cohort alike — charges its Jina embedding to this
    // lesson rather than to nobody.
    costContext: { courseId, stage: 'stage_6', phase: 'rag_retrieval', lessonId },
  });

  logger.debug(
    {
      lessonId,
      filteringByDocs,
      documentCount: primaryDocIds?.length ?? 0,
      twoTierEnabled: TWO_TIER_CONFIG.enabled,
    },
    filteringByDocs
      ? `RAG filtering by ${primaryDocIds?.length ?? 0} documents`
      : 'RAG searching all course documents'
  );

  const tier1QueryCount = TWO_TIER_CONFIG.enabled
    ? Math.min(TWO_TIER_CONFIG.TIER1_QUERY_COUNT, queries.length)
    : 0;
  const tier1Queries = queries.slice(0, tier1QueryCount);
  const tier2Queries = TWO_TIER_CONFIG.enabled ? queries.slice(tier1QueryCount) : queries;

  if (TWO_TIER_CONFIG.enabled && tier1Queries.length > 0) {
    const shouldExit = await runTier1Gate({
      courseId,
      lessonId,
      organizationId: tenantOrganizationId,
      queries,
      tier1Queries,
      tier2Queries,
      baseSearchOptions,
      evidenceContext,
      collector,
      ragRequired: ragAvailability.ragRequired,
    });
    if (shouldExit) {
      return { ...empty(), fallbackUsed: collector.queryFailureCount > 0 };
    }
  }

  // TIER 2: full retrieval. Only reached if Tier 1 found at least one chunk, or Two-Tier is off.
  const enoughCandidates = Math.min(candidateCount * 1.5, LESSON_RAG_CONFIG.MAX_CHUNKS * 4);
  await runQueryPass({
    queries: TWO_TIER_CONFIG.enabled ? tier2Queries : queries,
    scoreThreshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
    tier: 2,
    courseId,
    lessonId,
    organizationId: tenantOrganizationId,
    baseSearchOptions,
    evidenceContext,
    collector,
    stopWhenEnough: () => collector.allChunks.length >= enoughCandidates,
  });

  if (ragAvailability.ragRequired && collector.queryFailureCount > 0) {
    throw new RequiredRagUnavailableError(
      courseId,
      'qdrant_service_unavailable',
      'Stage 6 required evidence retrieval was incomplete'
    );
  }

  return rankAndAssemble({
    params,
    organizationId: tenantOrganizationId,
    queries,
    tier1Queries,
    targetChunks,
    collector,
    startTime,
  });
}

export async function retrieveLessonContext(params: LessonRAGParams): Promise<LessonRAGResult> {
  try {
    const result = await retrieveLessonContextCore(params);
    const status = result.cached
      ? 'cached'
      : result.fallbackUsed
        ? 'fallback'
        : result.totalRetrieved > 0
          ? 'success'
          : 'empty';
    await publishDocumentEvidenceMetricsSafely(
      { stage: 'stage6', status, retrievals: 1, fallbacks: status === 'fallback' ? 1 : 0 },
      logger
    );
    const { fallbackUsed: _fallbackUsed, ...publicResult } = result;
    return publicResult;
  } catch (error) {
    await publishDocumentEvidenceMetricsSafely(
      { stage: 'stage6', status: 'failed', retrievals: 1, fallbacks: 0 },
      logger
    );
    throw error;
  }
}

/**
 * Retrieve RAG context for multiple lessons in parallel
 *
 * Useful for batch processing when generating multiple lessons.
 * Uses Promise.allSettled to handle partial failures gracefully.
 *
 * @param params - Array of lesson RAG parameters
 * @returns Map of lesson ID to RAG result
 *
 * @example
 * ```typescript
 * const results = await retrieveMultipleLessons([
 *   { courseId: 'c1', lessonSpec: spec1 },
 *   { courseId: 'c1', lessonSpec: spec2 },
 * ]);
 * // Returns: Map { '1.1' => result1, '1.2' => result2 }
 * ```
 */
export async function retrieveMultipleLessons(
  params: LessonRAGParams[]
): Promise<Map<string, LessonRAGResult>> {
  const results = new Map<string, LessonRAGResult>();

  const promises = params.map(async param => {
    const result = await retrieveLessonContext(param);
    return { lessonId: param.lessonSpec.lesson_id, result };
  });

  const settled = await Promise.allSettled(promises);

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.set(outcome.value.lessonId, outcome.value.result);
    } else {
      logger.error(
        {
          err: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        },
        '[Lesson RAG] Batch retrieval item failed'
      );
    }
  }

  return results;
}
