/**
 * The second half of lesson retrieval: rank what was gathered, widen it, and answer.
 *
 * @module retrieval-assembly
 *
 * Split out of `retriever.ts` at 847 lines of code. The seam is where the retrieval stops
 * talking to Qdrant: everything left there decides WHICH queries to run and whether to keep
 * going, while this decides what to do with what came back — rerank, expand to sibling context,
 * score coverage, trace, cache.
 */

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { expandToSiblingContext } from '@/shared/qdrant/context-expansion';

import { LESSON_RAG_CONFIG, RERANKER_CONFIG, TWO_TIER_CONFIG } from './constants';
import type { LessonRAGParams, LessonRAGResult, LessonRAGChunk } from './types';
import { generateCacheKey } from './helpers';
import { rerankChunks } from './reranking';
import { estimateTokens } from './formatters';
import { calculateLessonCoverage } from './coverage';
import { getStage6EvidenceProvenance } from './evidence-context';
import type { RetrievalCollector } from './retrieval-collector';

export interface AssembleInput {
  params: LessonRAGParams;
  organizationId: string;
  queries: string[];
  tier1Queries: string[];
  targetChunks: number;
  collector: RetrievalCollector;
  startTime: number;
}

/**
 * Rerank what was gathered, expand it to sibling context, and answer.
 *
 * Order matters and is not obvious: reranking is a cross-encoder over the retrieved text and
 * discards four candidates in five, so widening BEFORE it would pay to fetch context that is
 * about to be thrown away, and would hand the model that judges relevance a passage where a
 * focused chunk was meant to be.
 */
export async function rankAndAssemble(
  input: AssembleInput
): Promise<LessonRAGResult & { fallbackUsed?: boolean }> {
  const { params, queries, tier1Queries, targetChunks, collector, startTime } = input;
  const { courseId, lessonSpec, useCache = true, evidenceContext } = params;
  const { allChunks, queriesUsed, queryFailureCount } = collector;

  const chunksBeforeRerank = allChunks.length;
  let rerankDurationMs = 0;
  let sortedChunks: LessonRAGChunk[];

  if (RERANKER_CONFIG.enabled && allChunks.length > 0) {
    const rerankStartTime = Date.now();
    sortedChunks = await rerankChunks(allChunks, queries, lessonSpec.lesson_id, targetChunks, {
      courseId,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      lessonId: lessonSpec.lesson_id,
      stepName: 'jina_rerank',
    });
    rerankDurationMs = Date.now() - rerankStartTime;
  } else {
    // Fallback to Qdrant score sorting
    sortedChunks = allChunks
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, targetChunks);
  }

  sortedChunks = await expandToSiblingContext(
    sortedChunks.map(chunk => ({
      ...chunk,
      score: chunk.similarity_score,
      token_count: chunk.token_count ?? estimateTokens(chunk.content),
    })),
    { maxTokens: LESSON_RAG_CONFIG.MAX_TOKENS }
  );

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

  const coverageScore = calculateLessonCoverage(ragChunks, lessonSpec);
  const retrievalDurationMs = Date.now() - startTime;

  // Log trace for observability in TraceViewer
  try {
    const scores = ragChunks.map(chunk => chunk.relevance_score);
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
                avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
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
          chunks: sortedChunks.map(chunk => ({
            chunkId: chunk.chunk_id,
            documentId: chunk.document_id,
            documentName: chunk.document_name,
            content: chunk.content,
            headingPath: chunk.heading_path,
            score: chunk.similarity_score,
            matchedQuery: chunk.matched_query,
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
