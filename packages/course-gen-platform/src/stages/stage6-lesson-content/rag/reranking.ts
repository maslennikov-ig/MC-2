import { rerankDocuments, type RerankResult } from '@/shared/jina';
import { logger } from '@/shared/logger';
import { RERANKER_CONFIG } from './constants';
import type { LessonRAGChunk } from './types';

/**
 * Rerank chunks using Jina Reranker API
 *
 * This function:
 * 1. Combines all queries into a single search query
 * 2. Sends chunks to Jina Reranker for cross-encoder scoring
 * 3. Returns top N chunks sorted by reranked scores
 * 4. Falls back to Qdrant scores if reranking fails
 *
 * @param chunks - Candidate chunks from Qdrant search
 * @param queries - Search queries used for retrieval
 * @param lessonId - Lesson ID for logging
 * @param topN - Number of top chunks to return
 * @returns Reranked chunks with updated similarity scores
 */
export async function rerankChunks(
  chunks: LessonRAGChunk[],
  queries: string[],
  lessonId: string,
  topN: number
): Promise<LessonRAGChunk[]> {
  const rerankStartTime = Date.now();

  try {
    // Combine queries into a single query for reranking
    // Use first 3 queries for relevance (avoid overly long query strings)
    const combinedQuery = queries.slice(0, 3).join(' ');

    // Extract document texts for reranking
    const documents = chunks.map(chunk => chunk.content);

    logger.debug(
      {
        lessonId,
        candidateCount: chunks.length,
        topN,
        combinedQueryLength: combinedQuery.length,
      },
      '[Lesson RAG] Starting reranking'
    );

    // Call Jina Reranker API
    const rerankResults: RerankResult[] = await rerankDocuments(
      combinedQuery,
      documents,
      topN // Request top N from API directly
    );

    const rerankDurationMs = Date.now() - rerankStartTime;

    // Map reranked scores back to chunks
    const rerankedChunks = rerankResults.map(result => {
      const originalChunk = chunks[result.index];
      return {
        ...originalChunk,
        similarity_score: result.relevance_score, // Update with reranked score
      };
    });

    // Calculate score statistics for logging
    const scores = rerankedChunks.map(c => c.similarity_score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    logger.info(
      {
        lessonId,
        candidatesReranked: chunks.length,
        topChunksReturned: rerankedChunks.length,
        scoreDistribution: {
          min: minScore.toFixed(3),
          max: maxScore.toFixed(3),
          avg: avgScore.toFixed(3),
        },
        rerankDurationMs,
      },
      '[Lesson RAG] Reranking complete'
    );

    return rerankedChunks;
  } catch (error) {
    const rerankDurationMs = Date.now() - rerankStartTime;

    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        lessonId,
        candidateCount: chunks.length,
        rerankDurationMs,
        fallback: RERANKER_CONFIG.fallbackOnError,
      },
      '[Lesson RAG] Reranking failed - falling back to Qdrant scores'
    );

    // Fallback: use original Qdrant scores
    if (RERANKER_CONFIG.fallbackOnError) {
      return chunks.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, topN);
    } else {
      // If fallback disabled, rethrow error
      throw error;
    }
  }
}
