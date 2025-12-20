/**
 * Lesson-level RAG Retrieval Service
 * Retrieves 5-10 focused chunks per lesson for Stage 6 content generation
 *
 * This service is distinct from section-level RAG (20-30 chunks) in Stage 5.
 * Lesson-level retrieval is more focused with higher score thresholds,
 * optimized for generating detailed lesson content.
 *
 * Features:
 * - Retrieves 5-10 chunks per lesson (TARGET_CHUNKS: 7)
 * - Higher score threshold (0.75) than section-level
 * - Uses ragContextCache for retry consistency
 * - Builds queries from: rag_context.search_queries + learning_objectives + section key_points
 * - Calculates coverage score based on objective coverage
 * - Formats output as XML for prompt injection
 *
 * @module stages/stage6-lesson-content/utils/lesson-rag-retriever
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions } from '@/shared/qdrant/search-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import type { RAGChunk as SectionRAGChunk } from '@/stages/stage5-generation/utils/section-rag-retriever';
import { logger } from '@/shared/logger';
import { rerankDocuments, type RerankResult } from '../../../shared/jina';
import { logTrace } from '../../../shared/trace-logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Lesson RAG retrieval configuration
 *
 * These values are optimized for lesson-level content generation:
 * - Higher score threshold (0.75) ensures more relevant chunks
 * - Lower chunk count (5-10) focuses context on lesson specifics
 * - Lower token budget (20K) vs section-level (40K)
 */
export const LESSON_RAG_CONFIG = {
  /** Target number of chunks (middle of 5-10 range) */
  TARGET_CHUNKS: 7,
  /** Minimum acceptable chunks */
  MIN_CHUNKS: 5,
  /** Maximum chunks to retrieve */
  MAX_CHUNKS: 10,
  /** Score threshold - lowered to capture all relevant chunks (reranker handles quality) */
  SCORE_THRESHOLD: 0.25,
  /** Enable hybrid search (dense + sparse) - ENABLED: sparse vectors now uploaded + native Query API with server-side RRF */
  ENABLE_HYBRID: true,
  /** Token budget for lesson-level context */
  MAX_TOKENS: 20_000,
  /** Maximum queries to execute */
  MAX_QUERIES: 10,
} as const;

/**
 * Reranker configuration for lesson-level RAG
 *
 * Fetches more candidates than needed, then reranks with Jina to get top N.
 * This improves relevance by leveraging cross-encoder reranking.
 */
const RERANKER_CONFIG = {
  /** Enable reranking (set to false to disable) */
  enabled: true,
  /** Fetch N times more candidates for reranking */
  candidateMultiplier: 4,
  /** Use Qdrant scores if reranker fails */
  fallbackOnError: true,
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Internal RAG chunk representation for lesson retrieval
 * Maps from Qdrant SearchResult to RAGChunk format
 */
interface LessonRAGChunk {
  /** Unique chunk identifier */
  chunk_id: string;
  /** Source document UUID */
  document_id: string;
  /** Document filename */
  document_name: string;
  /** Chunk text content */
  content: string;
  /** Heading path or section identifier */
  heading_path: string;
  /** Similarity score from vector search */
  similarity_score: number;
  /** Query that retrieved this chunk */
  matched_query: string;
}

/**
 * Lesson RAG retrieval result
 */
export interface LessonRAGResult {
  /** Lesson ID from specification */
  lessonId: string;
  /** Retrieved chunks sorted by score */
  chunks: RAGChunk[];
  /** Total number of chunks retrieved */
  totalRetrieved: number;
  /** Queries that returned results */
  queriesUsed: string[];
  /** Coverage score (0-1): objectives covered / total objectives */
  coverageScore: number;
  /** Retrieval duration in milliseconds */
  retrievalDurationMs: number;
  /** Whether result came from cache */
  cached: boolean;
}

/**
 * Parameters for lesson-level retrieval
 */
export interface LessonRAGParams {
  /** Course UUID */
  courseId: string;
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2;
  /** Target number of chunks (default: 7) */
  targetChunks?: number;
  /** Whether to use/populate cache (default: true) */
  useCache?: boolean;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Retrieve RAG context for a single lesson
 *
 * Uses lesson's rag_context specification and learning objectives as queries.
 * Supports caching for retry consistency via ragContextCache.
 *
 * @param params - Lesson retrieval parameters
 * @returns LessonRAGResult with chunks and metrics
 *
 * @example
 * ```typescript
 * const result = await retrieveLessonContext({
 *   courseId: 'course-uuid-123',
 *   lessonSpec: lessonSpecification,
 *   targetChunks: 7,
 *   useCache: true,
 * });
 *
 * if (result.chunks.length >= LESSON_RAG_CONFIG.MIN_CHUNKS) {
 *   // Use chunks for generation
 *   const context = formatLessonChunksForPrompt(result.chunks, result.lessonId);
 * }
 * ```
 */
export async function retrieveLessonContext(
  params: LessonRAGParams
): Promise<LessonRAGResult> {
  const startTime = Date.now();
  const {
    courseId,
    lessonSpec,
    targetChunks = LESSON_RAG_CONFIG.TARGET_CHUNKS,
    useCache = true,
  } = params;

  logger.debug({
    courseId,
    lessonId: lessonSpec.lesson_id,
    targetChunks,
    useCache,
  }, '[Lesson RAG] Starting retrieval');

  // Check cache first if enabled
  if (useCache && lessonSpec.rag_context) {
    const ragContextId = generateCacheKey(courseId, lessonSpec.lesson_id);
    const cached = await ragContextCache.get(ragContextId);

    if (cached) {
      logger.debug({
        lessonId: lessonSpec.lesson_id,
        cachedChunks: cached.chunks.length,
      }, '[Lesson RAG] Using cached context');

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
    logger.warn({
      lessonId: lessonSpec.lesson_id,
    }, '[Lesson RAG] No search queries generated');

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
        logger.debug({
          lessonId: lessonSpec.lesson_id,
          filteringByDocs,
          documentCount: primaryDocIds?.length ?? 0,
        }, filteringByDocs
          ? `RAG filtering by ${primaryDocIds.length} documents`
          : 'RAG searching all course documents');
      }

      const searchOptions: SearchOptions = {
        limit: Math.ceil(candidateCount / queries.length) + 2, // Extra for deduplication
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
          queriesUsed.push(query);
        }
      }

      logger.debug({
        lessonId: lessonSpec.lesson_id,
        query: query.substring(0, 50),
        resultsCount: response.results.length,
        totalUnique: allChunks.length,
      }, '[Lesson RAG] Query executed');
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 50),
        lessonId: lessonSpec.lesson_id,
      }, '[Lesson RAG] Query failed - continuing with remaining queries');
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
    sortedChunks = await rerankChunks(
      allChunks,
      queries,
      lessonSpec.lesson_id,
      targetChunks
    );
    rerankDurationMs = Date.now() - rerankStartTime;
  } else {
    // Fallback to Qdrant score sorting
    sortedChunks = allChunks
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, targetChunks);
  }

  // Convert to RAGChunk format
  const ragChunks: RAGChunk[] = sortedChunks.map((chunk) => ({
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
        scoreDistribution: ragChunks.length > 0 ? {
          min: Math.min(...scores),
          max: Math.max(...scores),
          avg: scores.reduce((s, c) => s + c, 0) / scores.length,
        } : { min: 0, max: 0, avg: 0 },
        coverageScore,
        cached: false,
      },
      durationMs: retrievalDurationMs,
    });
  } catch (traceError) {
    // Don't fail retrieval if trace logging fails
    logger.warn({
      err: traceError instanceof Error ? traceError.message : String(traceError),
      lessonId: lessonSpec.lesson_id,
    }, '[Lesson RAG] Failed to log trace');
  }

  // Cache the result if enabled
  if (useCache) {
    try {
      await ragContextCache.store(courseId, lessonSpec.lesson_id, {
        sectionId: lessonSpec.lesson_id,
        chunks: sortedChunks.map((c) => ({
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
      logger.warn({
        err: cacheError instanceof Error ? cacheError.message : String(cacheError),
        lessonId: lessonSpec.lesson_id,
      }, '[Lesson RAG] Failed to cache result');
    }
  }

  logger.info({
    lessonId: lessonSpec.lesson_id,
    chunksRetrieved: ragChunks.length,
    queriesExecuted: queries.length,
    coverageScore: coverageScore.toFixed(2),
    durationMs: retrievalDurationMs,
  }, '[Lesson RAG] Retrieval complete');

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
 * Format chunks for prompt injection
 *
 * Creates a structured XML format for injection into generation prompts.
 * Truncates content if total exceeds maxTokens budget.
 *
 * @param chunks - RAG chunks to format
 * @param lessonId - Lesson identifier for XML attribute
 * @param maxTokens - Maximum token budget (default: 20000)
 * @returns Formatted XML string
 *
 * @example
 * ```typescript
 * const context = formatLessonChunksForPrompt(chunks, '1.1', 20000);
 * // Returns:
 * // <rag_context lesson_id="1.1" chunks="7">
 * //   <chunk document="file.pdf" heading="Chapter 1" score="0.85">
 * //     Content here...
 * //   </chunk>
 * //   ...
 * // </rag_context>
 * ```
 */
export function formatLessonChunksForPrompt(
  chunks: RAGChunk[],
  lessonId: string,
  maxTokens: number = LESSON_RAG_CONFIG.MAX_TOKENS
): string {
  if (!chunks || chunks.length === 0) {
    return `<rag_context lesson_id="${escapeXml(lessonId)}">\n  <!-- No RAG chunks available -->\n</rag_context>`;
  }

  const xmlParts: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  // Reserve tokens for XML wrapper
  const wrapperOverhead = 100;
  const availableTokens = maxTokens - wrapperOverhead;

  for (const chunk of chunks) {
    const chunkXml = formatSingleChunk(chunk);
    const chunkTokens = estimateTokens(chunkXml);

    if (currentTokens + chunkTokens > availableTokens) {
      truncated = true;
      break;
    }

    xmlParts.push(chunkXml);
    currentTokens += chunkTokens;
  }

  const content = xmlParts.join('\n');
  const truncationNote = truncated
    ? `\n  <!-- Truncated: ${chunks.length - xmlParts.length} additional chunks omitted due to token budget -->`
    : '';

  return `<rag_context lesson_id="${escapeXml(lessonId)}" chunks="${xmlParts.length}" total_available="${chunks.length}">${truncationNote}\n${content}\n</rag_context>`;
}

// ============================================================================
// BATCH RETRIEVAL
// ============================================================================

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

  const promises = params.map(async (param) => {
    const result = await retrieveLessonContext(param);
    return { lessonId: param.lessonSpec.lesson_id, result };
  });

  const settled = await Promise.allSettled(promises);

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.set(outcome.value.lessonId, outcome.value.result);
    } else {
      logger.error({
        err: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      }, '[Lesson RAG] Batch retrieval item failed');
    }
  }

  return results;
}

// ============================================================================
// SECTION-LEVEL PRE-RETRIEVAL (T062)
// ============================================================================

/**
 * Result of section context pre-retrieval
 */
export interface SectionContextPreRetrievalResult {
  /** Map of rag_context_id to cached chunks */
  contextMap: Map<string, RAGChunk[]>;
  /** Total sections processed */
  totalSections: number;
  /** Sections with cached context (cache hits) */
  cacheHits: number;
  /** Sections with freshly retrieved context */
  freshRetrievals: number;
  /** Total retrieval duration in milliseconds */
  totalDurationMs: number;
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

  logger.info({
    courseId,
    lessonId: lessonSpec.lesson_id,
    sectionCount: lessonSpec.sections.length,
  }, '[Lesson RAG] Pre-retrieving section contexts');

  // Process each section's rag_context_id
  for (const section of lessonSpec.sections) {
    const ragContextId = section.rag_context_id;

    // Check if already cached
    const cached = await getCachedSectionContext(ragContextId);

    if (cached) {
      contextMap.set(ragContextId, cached);
      cacheHits++;

      logger.debug({
        ragContextId,
        sectionTitle: section.title,
        cachedChunks: cached.length,
      }, '[Lesson RAG] Section context cache hit');
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

      logger.debug({
        ragContextId,
        sectionTitle: section.title,
        retrievedChunks: freshChunks.length,
      }, '[Lesson RAG] Section context freshly retrieved and cached');
    }
  }

  const totalDurationMs = Date.now() - startTime;

  logger.info({
    courseId,
    lessonId: lessonSpec.lesson_id,
    totalSections: lessonSpec.sections.length,
    cacheHits,
    freshRetrievals,
    totalDurationMs,
  }, '[Lesson RAG] Section contexts pre-retrieval complete');

  return {
    contextMap,
    totalSections: lessonSpec.sections.length,
    cacheHits,
    freshRetrievals,
    totalDurationMs,
  };
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
export async function getCachedSectionContext(
  ragContextId: string
): Promise<RAGChunk[] | null> {
  // Generate section-level cache key
  const cacheKey = generateSectionCacheKey(ragContextId);

  // Check ragContextCache using the section-level key
  const cached = await ragContextCache.get(cacheKey);

  if (cached) {
    logger.debug({
      ragContextId,
      cacheKey,
      chunkCount: cached.chunks.length,
    }, '[Lesson RAG] Section context cache hit');

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

  logger.debug({
    ragContextId,
    cacheKey,
  }, '[Lesson RAG] Section context cache miss');

  return null;
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
  const sectionChunks: SectionRAGChunk[] = chunks.map((chunk) => ({
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

    logger.debug({
      ragContextId,
      cacheKey,
      sectionTitle,
      chunkCount: chunks.length,
    }, '[Lesson RAG] Section context cached');
  } catch (error) {
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      ragContextId,
      sectionTitle,
    }, '[Lesson RAG] Failed to cache section context');
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
  const queries = [
    section.title,
    ...section.key_points_to_cover,
  ].slice(0, 5); // Limit to 5 queries per section

  const allChunks: LessonRAGChunk[] = [];
  const seenChunkIds = new Set<string>();

  for (const query of queries) {
    try {
      const primaryDocIds = lessonSpec.rag_context?.primary_documents;
      const filteringByDocs = primaryDocIds && primaryDocIds.length > 0;

      // Log primary_documents filtering status on first query only
      if (queries.indexOf(query) === 0) {
        logger.debug({
          lessonId: lessonSpec.lesson_id,
          sectionTitle: section.title,
          filteringByDocs,
          documentCount: primaryDocIds?.length ?? 0,
        }, filteringByDocs
          ? `Section RAG filtering by ${primaryDocIds.length} documents`
          : 'Section RAG searching all course documents');
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
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 50),
        sectionTitle: section.title,
      }, '[Lesson RAG] Section query failed');
    }
  }

  // Sort by score and take top chunks
  const sortedChunks = allChunks
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, 5); // 5 chunks per section

  // Convert to RAGChunk format with rag_context_id in metadata
  return sortedChunks.map((chunk) => ({
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

// ============================================================================
// RERANKING
// ============================================================================

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
async function rerankChunks(
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
    const documents = chunks.map((chunk) => chunk.content);

    logger.debug({
      lessonId,
      candidateCount: chunks.length,
      topN,
      combinedQueryLength: combinedQuery.length,
    }, '[Lesson RAG] Starting reranking');

    // Call Jina Reranker API
    const rerankResults: RerankResult[] = await rerankDocuments(
      combinedQuery,
      documents,
      topN // Request top N from API directly
    );

    const rerankDurationMs = Date.now() - rerankStartTime;

    // Map reranked scores back to chunks
    const rerankedChunks = rerankResults.map((result) => {
      const originalChunk = chunks[result.index];
      return {
        ...originalChunk,
        similarity_score: result.relevance_score, // Update with reranked score
      };
    });

    // Calculate score statistics for logging
    const scores = rerankedChunks.map((c) => c.similarity_score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    logger.info({
      lessonId,
      candidatesReranked: chunks.length,
      topChunksReturned: rerankedChunks.length,
      scoreDistribution: {
        min: minScore.toFixed(3),
        max: maxScore.toFixed(3),
        avg: avgScore.toFixed(3),
      },
      rerankDurationMs,
    }, '[Lesson RAG] Reranking complete');

    return rerankedChunks;
  } catch (error) {
    const rerankDurationMs = Date.now() - rerankStartTime;

    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      lessonId,
      candidateCount: chunks.length,
      rerankDurationMs,
      fallback: RERANKER_CONFIG.fallbackOnError,
    }, '[Lesson RAG] Reranking failed - falling back to Qdrant scores');

    // Fallback: use original Qdrant scores
    if (RERANKER_CONFIG.fallbackOnError) {
      return chunks
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, topN);
    } else {
      // If fallback disabled, rethrow error
      throw error;
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
function buildLessonQueries(lessonSpec: LessonSpecificationV2): string[] {
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
 * Calculate how well retrieved chunks cover lesson objectives
 *
 * Checks if key terms from learning objectives appear in retrieved content.
 * Uses a 50% term coverage threshold per objective.
 *
 * @param chunks - Retrieved RAG chunks
 * @param lessonSpec - Lesson specification
 * @returns Coverage score between 0 and 1
 */
function calculateLessonCoverage(
  chunks: RAGChunk[],
  lessonSpec: LessonSpecificationV2
): number {
  if (!lessonSpec.learning_objectives || lessonSpec.learning_objectives.length === 0) {
    return 1.0; // No objectives = full coverage
  }

  if (!chunks || chunks.length === 0) {
    return 0.0; // No chunks = no coverage
  }

  // Combine all chunk content for searching
  const contentPool = chunks.map((c) => c.content.toLowerCase()).join(' ');
  const objectives = lessonSpec.learning_objectives.map((o) => o.objective.toLowerCase());

  let covered = 0;
  for (const obj of objectives) {
    // Extract key terms (words longer than 4 characters)
    const keyTerms = obj.split(/\s+/).filter((t) => t.length > 4);
    if (keyTerms.length === 0) {
      covered++; // No key terms = consider covered
      continue;
    }

    // Check term coverage
    const termsCovered = keyTerms.filter((term) => contentPool.includes(term)).length;
    if (termsCovered / keyTerms.length >= 0.5) {
      covered++;
    }
  }

  return objectives.length > 0 ? covered / objectives.length : 0;
}

/**
 * Generate cache key for lesson RAG context
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson ID
 * @returns Cache key string
 */
function generateCacheKey(courseId: string, lessonId: string): string {
  return `rag_${courseId}_lesson_${lessonId}`;
}

/**
 * Create empty result for failed retrievals
 *
 * @param lessonId - Lesson identifier
 * @param durationMs - Duration of attempted retrieval
 * @returns Empty LessonRAGResult
 */
function createEmptyResult(lessonId: string, durationMs: number): LessonRAGResult {
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
 * Format a single chunk as XML
 *
 * @param chunk - RAG chunk to format
 * @returns XML string for the chunk
 */
function formatSingleChunk(chunk: RAGChunk): string {
  const escapedContent = escapeXml(chunk.content);
  const escapedHeading = escapeXml(chunk.page_or_section || '');
  const escapedDocument = escapeXml(chunk.document_name);

  return `  <chunk document="${escapedDocument}" heading="${escapedHeading}" score="${chunk.relevance_score.toFixed(2)}">
${escapedContent}
  </chunk>`;
}

/**
 * Escape XML special characters
 *
 * @param text - Text to escape
 * @returns Escaped text safe for XML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate token count from text
 *
 * Uses conservative ratio of 2.5 characters per token.
 * Works well for both Russian (longer words) and English (shorter words).
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
  return Math.floor(text.length / 2.5);
}
