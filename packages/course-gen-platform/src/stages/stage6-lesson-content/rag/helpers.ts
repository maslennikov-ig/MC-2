import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { validatePriorityLevel } from '@/shared/constants/priority-weights';
import { LESSON_RAG_CONFIG } from './constants';
import type { LessonRAGResult, SourceDocument } from './types';

/**
 * Build search queries from lesson specification
 *
 * Combines queries from multiple sources:
 * 1. rag_context.search_queries (primary source)
 * 2. Learning objectives (objective text)
 * 3. Section key_points_to_cover
 *
 * @param lessonSpec - Lesson specification
 * @returns Deduplicated array of search queries (max 10)
 */
export function buildLessonQueries(lessonSpec: LessonSpecificationV2): string[] {
  const queries: string[] = [];

  // 1. Queries from rag_context.search_queries
  if (lessonSpec.rag_context?.search_queries) {
    queries.push(...lessonSpec.rag_context.search_queries);
  }

  // 2. Learning objectives as queries
  for (const obj of lessonSpec.learning_objectives) {
    queries.push(obj.objective);
  }

  // 3. Section key points
  for (const section of lessonSpec.sections) {
    queries.push(...section.key_points_to_cover);
  }

  // Deduplicate and limit
  return [...new Set(queries)].slice(0, LESSON_RAG_CONFIG.MAX_QUERIES);
}

/**
 * Generate cache key for lesson RAG context
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson ID
 * @returns Cache key string
 */
export function generateCacheKey(courseId: string, lessonId: string): string {
  return `rag_${courseId}_lesson_${lessonId}`;
}

/**
 * Create empty result for failed retrievals
 *
 * @param lessonId - Lesson identifier
 * @param durationMs - Duration of attempted retrieval
 * @returns Empty LessonRAGResult
 */
export function createEmptyResult(lessonId: string, durationMs: number): LessonRAGResult {
  return {
    lessonId,
    chunks: [],
    totalRetrieved: 0,
    queriesUsed: [],
    coverageScore: 0,
    retrievalDurationMs: durationMs,
    cached: false,
  };
}

/**
 * Extract unique source documents from retrieved RAG chunks
 *
 * Aggregates chunks by document_id and returns attribution data
 * for storing in lessons.source_documents column.
 *
 * @param chunks - Retrieved RAG chunks
 * @returns Array of SourceDocument sorted by chunk_count (most used first)
 */
export function extractSourceDocuments(chunks: RAGChunk[]): SourceDocument[] {
  const docMap = new Map<string, SourceDocument>();

  for (const chunk of chunks) {
    const existing = docMap.get(chunk.document_id);
    if (existing) {
      existing.chunk_count++;
    } else {
      // Extract and validate priority from metadata using shared utility
      const priority = validatePriorityLevel(chunk.metadata?.document_priority, {
        chunkId: chunk.chunk_id,
        documentId: chunk.document_id,
      });

      docMap.set(chunk.document_id, {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        document_priority: priority,
        chunk_count: 1,
      });
    }
  }

  // Sort by chunk_count descending (most used documents first)
  return Array.from(docMap.values()).sort((a, b) => b.chunk_count - a.chunk_count);
}
