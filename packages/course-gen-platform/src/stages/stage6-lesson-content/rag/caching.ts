import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions } from '@/shared/qdrant/search-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import type { RAGChunk as SectionRAGChunk } from '@/stages/stage5-generation/utils/section-rag-retriever';
import { logger } from '@/shared/logger';
import { LESSON_RAG_CONFIG } from './constants';
import type { SectionContextPreRetrievalResult, LessonRAGChunk } from './types';

/**
 * Generate cache key for section-level RAG context
 *
 * Uses the rag_context_id directly to ensure retry consistency.
 *
 * @param ragContextId - Section's unique RAG context identifier
 * @returns Cache key string
 */
function generateSectionCacheKey(ragContextId: string): string {
  return `rag_section_${ragContextId}`;
}

/**
 * Cache section context by rag_context_id
 *
 * @param ragContextId - Section's unique RAG context identifier
 * @param courseId - Course UUID for cache indexing
 * @param sectionTitle - Section title for logging
 * @param chunks - RAG chunks to cache
 */
async function cacheSectionContext(
  ragContextId: string,
  courseId: string,
  sectionTitle: string,
  chunks: RAGChunk[]
): Promise<void> {
  const cacheKey = generateSectionCacheKey(ragContextId);

  // Convert to SectionRAGChunk format for cache storage
  const sectionChunks: SectionRAGChunk[] = chunks.map(chunk => ({
    chunkId: chunk.chunk_id,
    documentId: chunk.document_id,
    documentName: chunk.document_name,
    content: chunk.content,
    headingPath: chunk.page_or_section || '',
    score: chunk.relevance_score,
    matchedQuery: (chunk.metadata?.matched_query as string) || '',
  }));

  try {
    await ragContextCache.store(courseId, ragContextId, {
      sectionId: ragContextId,
      chunks: sectionChunks,
      totalRetrieved: chunks.length,
      searchQueriesUsed: [],
      coverageScore: 1.0, // Not calculated for section-level
      retrievalDurationMs: 0, // Not tracked individually
    });

    logger.debug(
      {
        ragContextId,
        cacheKey,
        sectionTitle,
        chunkCount: chunks.length,
      },
      '[Lesson RAG] Section context cached'
    );
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        ragContextId,
        sectionTitle,
      },
      '[Lesson RAG] Failed to cache section context'
    );
  }
}

/**
 * Retrieve fresh section context (when cache miss)
 *
 * @param params - Section retrieval parameters
 * @returns Retrieved RAG chunks
 */
async function retrieveSectionContextFresh(params: {
  courseId: string;
  lessonSpec: LessonSpecificationV2;
  section: LessonSpecificationV2['sections'][0];
}): Promise<RAGChunk[]> {
  const { courseId, lessonSpec, section } = params;

  // Build section-specific queries from key points
  const queries = [section.title, ...section.key_points_to_cover].slice(0, 5); // Limit to 5 queries per section

  const allChunks: LessonRAGChunk[] = [];
  const seenChunkIds = new Set<string>();

  for (const query of queries) {
    try {
      const primaryDocIds = lessonSpec.rag_context?.primary_documents;
      const filteringByDocs = primaryDocIds && primaryDocIds.length > 0;

      // Log primary_documents filtering status on first query only
      if (queries.indexOf(query) === 0) {
        logger.debug(
          {
            lessonId: lessonSpec.lesson_id,
            sectionTitle: section.title,
            filteringByDocs,
            documentCount: primaryDocIds?.length ?? 0,
          },
          filteringByDocs
            ? `Section RAG filtering by ${primaryDocIds.length} documents`
            : 'Section RAG searching all course documents'
        );
      }

      const searchOptions: SearchOptions = {
        limit: 3, // Fewer per query since we have multiple sections
        score_threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
        enable_hybrid: LESSON_RAG_CONFIG.ENABLE_HYBRID,
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
        }
      }
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          query: query.substring(0, 50),
          sectionTitle: section.title,
        },
        '[Lesson RAG] Section query failed'
      );
    }
  }

  // Sort by score and take top chunks
  const sortedChunks = allChunks
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, 5); // 5 chunks per section

  // Convert to RAGChunk format with rag_context_id in metadata
  return sortedChunks.map(chunk => ({
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    content: chunk.content,
    page_or_section: chunk.heading_path,
    relevance_score: chunk.similarity_score,
    metadata: {
      matched_query: chunk.matched_query,
      rag_context_id: section.rag_context_id,
    },
  }));
}

/**
 * Get RAG context for a specific section by its rag_context_id
 *
 * Used during retries to ensure the same context is used.
 * Returns null if not cached (caller should fall back to fresh retrieval).
 *
 * @param ragContextId - Section's rag_context_id from V2 specification
 * @returns Cached chunks or null
 *
 * @example
 * ```typescript
 * const cached = await getCachedSectionContext('section-1-rag-ctx');
 * if (cached) {
 *   // Use cached context for retry
 *   console.log(`Using ${cached.length} cached chunks`);
 * } else {
 *   // Fall back to fresh retrieval
 *   const fresh = await retrieveSectionContextFresh(...);
 * }
 * ```
 */
export async function getCachedSectionContext(ragContextId: string): Promise<RAGChunk[] | null> {
  // Generate section-level cache key
  const cacheKey = generateSectionCacheKey(ragContextId);

  // Check ragContextCache using the section-level key
  const cached = await ragContextCache.get(cacheKey);

  if (cached) {
    logger.debug(
      {
        ragContextId,
        cacheKey,
        chunkCount: cached.chunks.length,
      },
      '[Lesson RAG] Section context cache hit'
    );

    // Convert from SectionRAGChunk format to shared-types RAGChunk format
    return cached.chunks.map((chunk: SectionRAGChunk) => ({
      chunk_id: chunk.chunkId,
      document_id: chunk.documentId,
      document_name: chunk.documentName,
      content: chunk.content,
      page_or_section: chunk.headingPath,
      relevance_score: chunk.score,
      metadata: {
        matched_query: chunk.matchedQuery,
        rag_context_id: ragContextId,
      },
    }));
  }

  logger.debug(
    {
      ragContextId,
      cacheKey,
    },
    '[Lesson RAG] Section context cache miss'
  );

  return null;
}

/**
 * Pre-retrieve RAG context for all sections in a lesson
 *
 * This function ensures consistent RAG context across retries by:
 * 1. Checking if cached context exists for each section's rag_context_id
 * 2. If not cached, retrieving and caching the context
 * 3. Returning a map of rag_context_id -> chunks
 *
 * IMPORTANT: Call this BEFORE generation starts to ensure all sections
 * have their RAG context cached. On retry, the same context will be used.
 *
 * @param params - Pre-retrieval parameters
 * @returns Map of rag_context_id to RAGChunk[] plus metrics
 *
 * @example
 * ```typescript
 * const preRetrievalResult = await preRetrieveSectionContexts({
 *   courseId: 'course-uuid-123',
 *   lessonSpec: lessonSpecification,
 * });
 *
 * // On retry, same context is used:
 * const cachedContext = await getCachedSectionContext('section-rag-context-id');
 * ```
 */
export async function preRetrieveSectionContexts(params: {
  courseId: string;
  lessonSpec: LessonSpecificationV2;
}): Promise<SectionContextPreRetrievalResult> {
  const startTime = Date.now();
  const { courseId, lessonSpec } = params;

  const contextMap = new Map<string, RAGChunk[]>();
  let cacheHits = 0;
  let freshRetrievals = 0;

  logger.info(
    {
      courseId,
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
    },
    '[Lesson RAG] Pre-retrieving section contexts'
  );

  // Process each section's rag_context_id
  for (const section of lessonSpec.sections) {
    const ragContextId = section.rag_context_id;

    // Check if already cached
    const cached = await getCachedSectionContext(ragContextId);

    if (cached) {
      contextMap.set(ragContextId, cached);
      cacheHits++;

      logger.debug(
        {
          ragContextId,
          sectionTitle: section.title,
          cachedChunks: cached.length,
        },
        '[Lesson RAG] Section context cache hit'
      );
    } else {
      // Retrieve fresh context for this section
      const freshChunks = await retrieveSectionContextFresh({
        courseId,
        lessonSpec,
        section,
      });

      // Cache the context by rag_context_id
      await cacheSectionContext(ragContextId, courseId, section.title, freshChunks);

      contextMap.set(ragContextId, freshChunks);
      freshRetrievals++;

      logger.debug(
        {
          ragContextId,
          sectionTitle: section.title,
          retrievedChunks: freshChunks.length,
        },
        '[Lesson RAG] Section context freshly retrieved and cached'
      );
    }
  }

  const totalDurationMs = Date.now() - startTime;

  logger.info(
    {
      courseId,
      lessonId: lessonSpec.lesson_id,
      totalSections: lessonSpec.sections.length,
      cacheHits,
      freshRetrievals,
      totalDurationMs,
    },
    '[Lesson RAG] Section contexts pre-retrieval complete'
  );

  return {
    contextMap,
    totalSections: lessonSpec.sections.length,
    cacheHits,
    freshRetrievals,
    totalDurationMs,
  };
}
