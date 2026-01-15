import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions } from '@/shared/qdrant/search-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import type { RAGChunk as SectionRAGChunk } from '@/stages/stage5-generation/utils/section-rag-retriever';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { checkCourseHasIndexedDocuments } from '@/shared/rag/document-availability';

import { LESSON_RAG_CONFIG, RERANKER_CONFIG } from './constants';
import type { LessonRAGParams, LessonRAGResult, LessonRAGChunk } from './types';
import { generateCacheKey, buildLessonQueries, createEmptyResult } from './helpers';
import { rerankChunks } from './reranking';
import { calculateLessonCoverage } from './coverage';

/**
 * Retrieve RAG context for a single lesson
 *
 * Uses lesson's rag_context specification and learning objectives as queries.
 * Supports caching for retry consistency via ragContextCache.
 *
 * @param params - Lesson retrieval parameters
 * @returns LessonRAGResult with chunks and metrics
 */
export async function retrieveLessonContext(params: LessonRAGParams): Promise<LessonRAGResult> {
  const startTime = Date.now();
  const {
    courseId,
    lessonSpec,
    targetChunks = LESSON_RAG_CONFIG.TARGET_CHUNKS,
    useCache = true,
    enablePriorityBoost = true, // Default: boost CORE/IMPORTANT documents
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

  // OPTIMIZATION: Check if course has any indexed documents before making Qdrant queries
  // This prevents ~100s of wasted time when course has no uploaded documents
  const hasIndexedDocuments = await checkCourseHasIndexedDocuments(courseId);
  if (!hasIndexedDocuments) {
    logger.info(
      {
        courseId,
        lessonId: lessonSpec.lesson_id,
      },
      '[Lesson RAG] Course has no indexed documents, skipping RAG retrieval'
    );

    return createEmptyResult(lessonSpec.lesson_id, Date.now() - startTime);
  }

  // Check cache first if enabled
  if (useCache && lessonSpec.rag_context) {
    const ragContextId = generateCacheKey(courseId, lessonSpec.lesson_id);
    const cached = await ragContextCache.get(ragContextId);

    if (cached) {
      logger.debug(
        {
          lessonId: lessonSpec.lesson_id,
          cachedChunks: cached.chunks.length,
        },
        '[Lesson RAG] Using cached context'
      );

      // Convert cached chunks (section-rag format) to shared-types RAGChunk format
      const convertedChunks: RAGChunk[] = cached.chunks.map((chunk: SectionRAGChunk) => ({
        chunk_id: chunk.chunkId,
        document_id: chunk.documentId,
        document_name: chunk.documentName,
        content: chunk.content,
        page_or_section: chunk.headingPath,
        relevance_score: chunk.score,
        metadata: {
          matched_query: chunk.matchedQuery,
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

  for (const query of queries) {
    try {
      const primaryDocIds = lessonSpec.rag_context?.primary_documents;
      const filteringByDocs = primaryDocIds && primaryDocIds.length > 0;

      // Log primary_documents filtering status on first query only
      if (queries.indexOf(query) === 0) {
        logger.debug(
          {
            lessonId: lessonSpec.lesson_id,
            filteringByDocs,
            documentCount: primaryDocIds?.length ?? 0,
          },
          filteringByDocs
            ? `RAG filtering by ${primaryDocIds.length} documents`
            : 'RAG searching all course documents'
        );
      }

      const searchOptions: SearchOptions = {
        limit: Math.ceil(candidateCount / queries.length) + 2, // Extra for deduplication
        score_threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
        enable_hybrid: LESSON_RAG_CONFIG.ENABLE_HYBRID,
        // Priority boosting: CORE +20%, IMPORTANT +12% score boost
        // @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
        enable_priority_boost: enablePriorityBoost,
        filters: {
          course_id: courseId,
          // Filter by primary documents if specified (empty array = search all)
          ...(filteringByDocs && {
            document_ids: primaryDocIds,
          }),
        },
      };

      const response = await searchChunks(query, searchOptions);

      for (const result of response.results) {
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
          query: query.substring(0, 50),
          resultsCount: response.results.length,
          totalUnique: allChunks.length,
        },
        '[Lesson RAG] Query executed'
      );
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          query: query.substring(0, 50),
          lessonId: lessonSpec.lesson_id,
        },
        '[Lesson RAG] Query failed - continuing with remaining queries'
      );
    }

    // Stop if we have enough candidates
    if (allChunks.length >= Math.min(candidateCount * 1.5, LESSON_RAG_CONFIG.MAX_CHUNKS * 4)) break;
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
      await ragContextCache.store(courseId, lessonSpec.lesson_id, {
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
      });
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
  };
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
