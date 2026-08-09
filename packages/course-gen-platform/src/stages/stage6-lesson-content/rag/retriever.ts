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
import type { LessonRAGParams, LessonRAGResult, LessonRAGChunk } from './types';
import { generateCacheKey, buildLessonQueries, createEmptyResult } from './helpers';
import { rerankChunks } from './reranking';
import { calculateLessonCoverage } from './coverage';
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
async function retrieveLessonContextCore(
  params: LessonRAGParams
): Promise<LessonRAGResult & { fallbackUsed?: boolean }> {
  const startTime = Date.now();
  const {
    courseId,
    organizationId,
    lessonSpec,
    targetChunks = LESSON_RAG_CONFIG.TARGET_CHUNKS,
    useCache = true,
    enablePriorityBoost = true, // Default: boost CORE/IMPORTANT documents
    evidenceContext,
  } = params;

  logger.debug(
    {
      courseId,
      lessonId: lessonSpec.lesson_id,
      targetChunks,
      useCache,
      enablePriorityBoost,
    },
    '[Lesson RAG] Starting retrieval'
  );

  // Preserve existing resilience: if a lesson already has cached RAG context,
  // reuse it without touching live Qdrant.
  if (useCache && lessonSpec.rag_context) {
    const ragContextId = generateCacheKey(
      courseId,
      lessonSpec.lesson_id,
      evidenceContext?.cacheIdentity
    );
    const cached = await ragContextCache.get(ragContextId);

    if (cached) {
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
        {
          lessonId: lessonSpec.lesson_id,
          cachedChunks: cached.chunks.length,
        },
        '[Lesson RAG] Using cached context'
      );

      try {
        await logTrace({
          courseId,
          lessonId: lessonSpec.lesson_id,
          stage: 'stage_6',
          phase: 'rag_retrieval',
          stepName: 'cache_hit',
          inputData: {
            lessonId: lessonSpec.lesson_id,
            ragContextId,
          },
          outputData: {
            cachedChunks: cached.chunks.length,
            coverageScore: cached.coverageScore,
            cached: true,
          },
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
  }

  // OPTIMIZATION: Check if course has any indexed documents before making Qdrant queries
  // This prevents ~100s of wasted time when course has no uploaded documents
  const ragAvailability = await assertCourseRagReadyWithRetry(courseId);
  if (ragAvailability.availability === 'optional_no_documents') {
    logger.info(
      {
        courseId,
        lessonId: lessonSpec.lesson_id,
      },
      '[Lesson RAG] Course has no indexed documents, skipping RAG retrieval'
    );

    return createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime);
  }

  const tenantOrganizationId = requireTenantScope(organizationId);
  if (evidenceContext && evidenceContext.allowedDocumentIds.length === 0) {
    logger.info(
      {
        outcome: 'empty',
        allowedDocumentCount: 0,
      },
      '[Lesson RAG] Accepted evidence decisions exclude all document refs'
    );
    return createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime);
  }

  // Build search queries from lesson specification
  const queries = buildLessonQueries(lessonSpec);

  if (queries.length === 0) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
      },
      '[Lesson RAG] No search queries generated'
    );

    return createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime);
  }

  // Execute searches and collect chunks
  // When reranking is enabled, fetch more candidates (4x) for reranking
  const candidateCount = RERANKER_CONFIG.enabled
    ? targetChunks * RERANKER_CONFIG.candidateMultiplier
    : targetChunks;

  const allChunks: LessonRAGChunk[] = [];
  const seenChunkIds = new Set<string>();
  const queriesUsed: string[] = [];
  let queryFailureCount = 0;

  // Shared filter config for all queries
  const specifiedPrimaryDocIds = lessonSpec.rag_context?.primary_documents;
  const primaryDocIds = evidenceContext
    ? specifiedPrimaryDocIds && specifiedPrimaryDocIds.length > 0
      ? specifiedPrimaryDocIds.filter(documentId =>
          evidenceContext.allowedDocumentIds.includes(documentId)
        )
      : evidenceContext.allowedDocumentIds
    : specifiedPrimaryDocIds;
  if (
    evidenceContext &&
    specifiedPrimaryDocIds &&
    specifiedPrimaryDocIds.length > 0 &&
    primaryDocIds?.length === 0
  ) {
    return createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime);
  }
  const filteringByDocs = primaryDocIds && primaryDocIds.length > 0;
  const baseSearchOptions: Omit<SearchOptions, 'score_threshold'> = {
    limit: Math.ceil(candidateCount / queries.length) + 2,
    enable_hybrid: LESSON_RAG_CONFIG.ENABLE_HYBRID,
    enable_priority_boost: enablePriorityBoost,
    filters: {
      organization_id: tenantOrganizationId,
      course_id: courseId,
      ...(filteringByDocs && { document_ids: primaryDocIds }),
    },
    include_payload: Boolean(evidenceContext),
    group_by_document: true,
    group_size: 2,
  };

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      filteringByDocs,
      documentCount: primaryDocIds?.length ?? 0,
      twoTierEnabled: TWO_TIER_CONFIG.enabled,
    },
    filteringByDocs
      ? `RAG filtering by ${primaryDocIds.length} documents`
      : 'RAG searching all course documents'
  );

  // ============================================================================
  // TWO-TIER RETRIEVAL: Tier 1 (Light Gate)
  // Execute first N queries with permissive threshold. If ALL return 0 → early exit.
  // This saves ~65% Qdrant queries and ~75% Jina Reranker calls for irrelevant lessons.
  // @see docs/plans/dapper-jumping-plum.md
  // ============================================================================
  const tier1QueryCount = TWO_TIER_CONFIG.enabled
    ? Math.min(TWO_TIER_CONFIG.TIER1_QUERY_COUNT, queries.length)
    : 0;
  const tier1Queries = queries.slice(0, tier1QueryCount);
  const tier2Queries = TWO_TIER_CONFIG.enabled ? queries.slice(tier1QueryCount) : queries;
  if (TWO_TIER_CONFIG.enabled && tier1Queries.length > 0) {
    const tier1StartTime = Date.now();

    for (const query of tier1Queries) {
      try {
        const searchOptions: SearchOptions = {
          ...baseSearchOptions,
          score_threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
        };

        const response = await searchChunks(query, searchOptions);

        for (const result of response.results) {
          if (evidenceContext) {
            assertEvidenceSearchResult({
              result,
              courseId,
              organizationId: tenantOrganizationId,
              evidenceContext,
            });
          }
          if (!seenChunkIds.has(result.chunk_id)) {
            seenChunkIds.add(result.chunk_id);
            allChunks.push({
              chunk_id: result.chunk_id,
              document_id: result.document_id,
              document_name: result.document_name,
              content: result.content,
              heading_path: result.heading_path,
              similarity_score: result.score,
              matched_query: query,
            });
            queriesUsed.push(query);
          }
        }

        logger.debug(
          {
            lessonId: lessonSpec.lesson_id,
            resultsCount: response.results.length,
            totalUnique: allChunks.length,
            tier: 1,
          },
          '[Lesson RAG] Tier 1 query executed'
        );
      } catch (error) {
        if (error instanceof Stage6EvidenceScopeError) throw error;
        queryFailureCount += 1;
        logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            lessonId: lessonSpec.lesson_id,
            tier: 1,
          },
          '[Lesson RAG] Tier 1 query failed - continuing'
        );
      }
    }

    const tier1DurationMs = Date.now() - tier1StartTime;

    // Strike-Two: if ALL Tier 1 queries returned 0 chunks → early exit
    if (allChunks.length === 0) {
      if (ragAvailability.ragRequired && queryFailureCount > 0) {
        throw new RequiredRagUnavailableError(
          courseId,
          'qdrant_service_unavailable',
          'All Stage 6 retrieval queries failed after required-RAG preflight'
        );
      }
      logger.info(
        {
          lessonId: lessonSpec.lesson_id,
          courseId,
          tier1Queries: tier1Queries.length,
          tier1DurationMs,
          tier1Threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
        },
        '[Lesson RAG] Tier 1 exit - no results from gate queries (Strike-Two)'
      );

      const shadowSelection = resolveTier1ShadowSelection(courseId, lessonSpec.lesson_id);
      // Log trace for observability
      try {
        await logTrace({
          courseId,
          lessonId: lessonSpec.lesson_id,
          stage: 'stage_6',
          phase: 'rag_retrieval',
          stepName: 'tier1_exit',
          inputData: {
            lessonId: lessonSpec.lesson_id,
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
          lessonId: lessonSpec.lesson_id,
          organizationId: tenantOrganizationId,
          tier1Queries,
          tier2Queries,
          baseSearchOptions,
          evidenceContext,
          shadowRate: shadowSelection.rate,
        }).catch(error =>
          logger.warn(
            {
              err: error instanceof Error ? error.message : String(error),
              courseId,
              lessonId: lessonSpec.lesson_id,
            },
            '[Lesson RAG] Tier 1 shadow retrieval failed'
          )
        );
      }

      return {
        ...createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime),
        fallbackUsed: queryFailureCount > 0,
      };
    }

    // Compute Tier 1 max score for threshold tuning data
    const tier1MaxScore =
      allChunks.length > 0 ? Math.max(...allChunks.map(c => c.similarity_score)) : 0;

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        tier1ChunksFound: allChunks.length,
        tier1MaxScore: tier1MaxScore.toFixed(3),
        tier1DurationMs,
      },
      '[Lesson RAG] Tier 1 passed - proceeding to Tier 2'
    );

    // Log trace for Tier 1 pass (helps measure false negative rate)
    try {
      await logTrace({
        courseId,
        lessonId: lessonSpec.lesson_id,
        stage: 'stage_6',
        phase: 'rag_retrieval',
        stepName: 'tier1_pass',
        inputData: {
          lessonId: lessonSpec.lesson_id,
          tier1Queries: tier1Queries.length,
          totalQueries: queries.length,
          tier1Threshold: TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD,
        },
        outputData: {
          tier1ChunksFound: allChunks.length,
          tier1MaxScore,
          tier1Exit: false,
        },
        durationMs: tier1DurationMs,
      });
    } catch {
      // Don't fail on trace error
    }
  }

  // ============================================================================
  // TIER 2: Full Retrieval (remaining queries + reranking)
  // Only reached if Tier 1 found at least one chunk, or if Two-Tier is disabled.
  // ============================================================================
  const tier2QueryList = TWO_TIER_CONFIG.enabled ? tier2Queries : queries;

  for (const query of tier2QueryList) {
    try {
      const searchOptions: SearchOptions = {
        ...baseSearchOptions,
        score_threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
      };

      const response = await searchChunks(query, searchOptions);

      for (const result of response.results) {
        if (evidenceContext) {
          assertEvidenceSearchResult({
            result,
            courseId,
            organizationId: tenantOrganizationId,
            evidenceContext,
          });
        }
        if (!seenChunkIds.has(result.chunk_id)) {
          seenChunkIds.add(result.chunk_id);
          allChunks.push({
            chunk_id: result.chunk_id,
            document_id: result.document_id,
            document_name: result.document_name,
            content: result.content,
            heading_path: result.heading_path,
            similarity_score: result.score,
            matched_query: query,
          });
          queriesUsed.push(query);
        }
      }

      logger.debug(
        {
          lessonId: lessonSpec.lesson_id,
          resultsCount: response.results.length,
          totalUnique: allChunks.length,
          tier: 2,
        },
        '[Lesson RAG] Tier 2 query executed'
      );
    } catch (error) {
      if (error instanceof Stage6EvidenceScopeError) throw error;
      queryFailureCount += 1;
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          lessonId: lessonSpec.lesson_id,
          tier: 2,
        },
        '[Lesson RAG] Tier 2 query failed - continuing with remaining queries'
      );
    }

    // Stop if we have enough candidates
    if (allChunks.length >= Math.min(candidateCount * 1.5, LESSON_RAG_CONFIG.MAX_CHUNKS * 4)) break;
  }

  if (ragAvailability.ragRequired && queryFailureCount > 0) {
    throw new RequiredRagUnavailableError(
      courseId,
      'qdrant_service_unavailable',
      'Stage 6 required evidence retrieval was incomplete'
    );
  }

  // Track candidates before reranking for metrics
  const chunksBeforeRerank = allChunks.length;
  let rerankDurationMs = 0;

  // Apply reranking if enabled and we have chunks
  let sortedChunks: LessonRAGChunk[];
  if (RERANKER_CONFIG.enabled && allChunks.length > 0) {
    const rerankStartTime = Date.now();
    sortedChunks = await rerankChunks(allChunks, queries, lessonSpec.lesson_id, targetChunks);
    rerankDurationMs = Date.now() - rerankStartTime;
  } else {
    // Fallback to Qdrant score sorting
    sortedChunks = allChunks
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, targetChunks);
  }

  // Convert to RAGChunk format
  const ragChunks: RAGChunk[] = sortedChunks.map(chunk => ({
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    content: chunk.content,
    page_or_section: chunk.heading_path,
    relevance_score: chunk.similarity_score,
    metadata: {
      matched_query: chunk.matched_query,
      ...(evidenceContext && {
        evidence_provenance: getStage6EvidenceProvenance(
          evidenceContext,
          chunk.document_id,
          chunk.chunk_id
        ),
      }),
    },
  }));

  // Calculate coverage score based on learning objectives
  const coverageScore = calculateLessonCoverage(ragChunks, lessonSpec);

  const retrievalDurationMs = Date.now() - startTime;

  // Log trace for observability in TraceViewer
  try {
    const scores = ragChunks.map(c => c.relevance_score);
    await logTrace({
      courseId,
      lessonId: lessonSpec.lesson_id,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      stepName: 'lesson_rerank',
      inputData: {
        lessonId: lessonSpec.lesson_id,
        queriesCount: queries.length,
        targetChunks,
        twoTierEnabled: TWO_TIER_CONFIG.enabled,
        tier1QueryCount: TWO_TIER_CONFIG.enabled ? tier1Queries.length : 0,
      },
      outputData: {
        rerankerEnabled: RERANKER_CONFIG.enabled,
        candidatesCount: chunksBeforeRerank,
        rerankedCount: ragChunks.length,
        rerankerLatencyMs: rerankDurationMs,
        scoreDistribution:
          ragChunks.length > 0
            ? {
                min: Math.min(...scores),
                max: Math.max(...scores),
                avg: scores.reduce((s, c) => s + c, 0) / scores.length,
              }
            : { min: 0, max: 0, avg: 0 },
        coverageScore,
        cached: false,
      },
      durationMs: retrievalDurationMs,
    });
  } catch (traceError) {
    // Don't fail retrieval if trace logging fails
    logger.warn(
      {
        err: traceError instanceof Error ? traceError.message : String(traceError),
        lessonId: lessonSpec.lesson_id,
      },
      '[Lesson RAG] Failed to log trace'
    );
  }

  // Cache the result if enabled
  if (useCache) {
    try {
      const cacheIdentity = generateCacheKey(
        courseId,
        lessonSpec.lesson_id,
        evidenceContext?.cacheIdentity
      );
      await ragContextCache.getOrRetrieve(courseId, lessonSpec.lesson_id, cacheIdentity, () =>
        Promise.resolve({
          sectionId: lessonSpec.lesson_id,
          chunks: sortedChunks.map(c => ({
            chunkId: c.chunk_id,
            documentId: c.document_id,
            documentName: c.document_name,
            content: c.content,
            headingPath: c.heading_path,
            score: c.similarity_score,
            matchedQuery: c.matched_query,
          })),
          totalRetrieved: ragChunks.length,
          searchQueriesUsed: [...new Set(queriesUsed)],
          coverageScore,
          retrievalDurationMs,
        })
      );
    } catch (cacheError) {
      logger.warn(
        {
          err: cacheError instanceof Error ? cacheError.message : String(cacheError),
          lessonId: lessonSpec.lesson_id,
        },
        '[Lesson RAG] Failed to cache result'
      );
    }
  }

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      chunksRetrieved: ragChunks.length,
      queriesExecuted: queries.length,
      coverageScore: coverageScore.toFixed(2),
      durationMs: retrievalDurationMs,
    },
    '[Lesson RAG] Retrieval complete'
  );

  return {
    lessonId: lessonSpec.lesson_id,
    chunks: ragChunks,
    totalRetrieved: ragChunks.length,
    queriesUsed: [...new Set(queriesUsed)],
    coverageScore,
    retrievalDurationMs,
    cached: false,
    fallbackUsed: queryFailureCount > 0,
  };
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
