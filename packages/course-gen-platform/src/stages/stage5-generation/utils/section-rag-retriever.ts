/**
 * Section-level RAG Retrieval Service
 * Retrieves 20-30 chunks per section for V2 LessonSpecification generation
 *
 * This service integrates with Stage 4's document_relevance_mapping to execute
 * search queries against Qdrant, deduplicate results, and format context for
 * injection into generation prompts.
 *
 * Token Budget Compliance (RT-003):
 * - MAX_TOKENS = 40,000 (maximum RAG context per section)
 * - Prioritizes highest-scored chunks if truncation needed
 * - Graceful degradation if Qdrant unavailable
 *
 * @module stages/stage5-generation/utils/section-rag-retriever
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions, SearchResult } from '@/shared/qdrant/search-types';
import { logger } from '@/shared/logger';
import { rerankDocuments, type RerankResult } from '../../../shared/jina';
import { logTrace } from '../../../shared/trace-logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration for section-level RAG retrieval
 */
const SECTION_RAG_DEFAULTS = {
  /** Target number of chunks (middle of 20-30 range) */
  TARGET_CHUNKS: 25,
  /** Maximum chunks to retrieve */
  MAX_CHUNKS: 30,
  /** Minimum chunks for acceptable coverage */
  MIN_CHUNKS: 20,
  /** Minimum similarity score threshold */
  SCORE_THRESHOLD: 0.7,
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
const RERANKER_CONFIG = {
  /** Enable reranking with Jina Reranker v2 */
  enabled: true,
  /** Fetch N times more candidates for reranking (100 total for 25 target) */
  candidateMultiplier: 4,
  /** Use Qdrant scores if reranker fails */
  fallbackOnError: true,
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * RAG plan for a section from document_relevance_mapping
 * Matches the structure in AnalysisResult.document_relevance_mapping[section_id]
 */
export interface SectionRAGPlan {
  /** File catalog IDs ranked by relevance */
  primary_documents: string[];
  /** Search queries for RAG retrieval */
  search_queries: string[];
  /** Topics expected to be found in chunks */
  expected_topics: string[];
  /** Confidence level based on processing_mode */
  confidence: 'high' | 'medium';
  /** Optional guidance for generation */
  note?: string;
}

/**
 * Parameters for section RAG retrieval
 */
export interface SectionRAGParams {
  /** Course UUID */
  courseId: string;
  /** Section ID from sections_breakdown */
  sectionId: string;
  /** RAG plan from document_relevance_mapping */
  ragPlan: SectionRAGPlan;
  /** Target number of chunks to retrieve (default: 25) */
  targetChunks?: number;
  /** Minimum similarity score threshold (default: 0.7) */
  scoreThreshold?: number;
}

/**
 * Individual RAG chunk with retrieval metadata
 */
export interface RAGChunk {
  /** Unique chunk identifier */
  chunkId: string;
  /** Source document UUID from file_catalog */
  documentId: string;
  /** Original document filename */
  documentName: string;
  /** Chunk text content */
  content: string;
  /** Heading path (e.g., "Chapter 1 > Section 2") */
  headingPath: string;
  /** Similarity score (0-1) */
  score: number;
  /** Query that retrieved this chunk */
  matchedQuery: string;
}

/**
 * Result of section-level RAG retrieval
 */
export interface SectionRAGResult {
  /** Section ID */
  sectionId: string;
  /** Retrieved chunks sorted by score */
  chunks: RAGChunk[];
  /** Actual number of chunks retrieved */
  totalRetrieved: number;
  /** Queries that returned results */
  searchQueriesUsed: string[];
  /** Coverage score (0-1): expected_topics found / total expected */
  coverageScore: number;
  /** Retrieval duration in milliseconds */
  retrievalDurationMs: number;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimates token count from text
 *
 * Uses conservative ratio of 2.5 characters per token, which works well for
 * Russian (longer words) and English (shorter words).
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
function estimateTokens(text: string): number {
  return Math.floor(text.length / 2.5);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Retrieves relevant context chunks for a section from Qdrant
 *
 * Executes search queries from the RAG plan, deduplicates results,
 * and returns top-scored chunks within the target range (20-30).
 *
 * @param params - Section RAG retrieval parameters
 * @returns Section RAG result with chunks and metrics
 *
 * @example
 * ```typescript
 * const result = await retrieveSectionContext({
 *   courseId: 'course-uuid-123',
 *   sectionId: '1',
 *   ragPlan: {
 *     primary_documents: ['doc-uuid-1', 'doc-uuid-2'],
 *     search_queries: ['machine learning basics', 'neural networks intro'],
 *     expected_topics: ['supervised learning', 'backpropagation'],
 *     confidence: 'high'
 *   }
 * });
 * // Returns: { chunks: [...], totalRetrieved: 25, coverageScore: 0.85, ... }
 * ```
 */
export async function retrieveSectionContext(
  params: SectionRAGParams
): Promise<SectionRAGResult> {
  const startTime = Date.now();
  const {
    courseId,
    sectionId,
    ragPlan,
    targetChunks = SECTION_RAG_DEFAULTS.TARGET_CHUNKS,
    scoreThreshold = SECTION_RAG_DEFAULTS.SCORE_THRESHOLD,
  } = params;

  logger.info({
    courseId,
    sectionId,
    queryCount: ragPlan.search_queries.length,
    targetChunks,
    scoreThreshold,
  }, '[Section RAG] Starting retrieval');

  try {
    // Validate RAG plan
    if (!ragPlan.search_queries || ragPlan.search_queries.length === 0) {
      logger.warn({
        courseId,
        sectionId,
      }, '[Section RAG] No search queries provided - returning empty result');

      return createEmptyResult(sectionId, Date.now() - startTime);
    }

    // Execute all search queries
    // If reranking enabled, fetch more candidates (candidateMultiplier * targetChunks)
    const allChunks: RAGChunk[] = [];
    const successfulQueries: string[] = [];
    const seenChunkIds = new Set<string>();

    // Calculate how many chunks to fetch per query
    const chunksPerQuery = RERANKER_CONFIG.enabled
      ? Math.ceil((targetChunks * RERANKER_CONFIG.candidateMultiplier) / ragPlan.search_queries.length)
      : SECTION_RAG_DEFAULTS.CHUNKS_PER_QUERY;

    for (const query of ragPlan.search_queries) {
      try {
        const queryChunks = await executeSearchQuery({
          query,
          courseId,
          primaryDocuments: ragPlan.primary_documents,
          scoreThreshold,
          limit: chunksPerQuery,
        });

        // Deduplicate by chunk ID
        for (const chunk of queryChunks) {
          if (!seenChunkIds.has(chunk.chunkId)) {
            seenChunkIds.add(chunk.chunkId);
            allChunks.push({
              ...chunk,
              matchedQuery: query,
            });
          }
        }

        if (queryChunks.length > 0) {
          successfulQueries.push(query);
        }

        logger.debug({
          courseId,
          sectionId,
          query: query.substring(0, 50),
          chunksRetrieved: queryChunks.length,
          totalUnique: allChunks.length,
        }, '[Section RAG] Query executed');

      } catch (queryError) {
        logger.warn({
          err: queryError instanceof Error ? queryError.message : String(queryError),
          courseId,
          sectionId,
          query: query.substring(0, 50),
        }, '[Section RAG] Query failed - continuing with remaining queries');
      }
    }

    // Sort by score descending
    let sortedChunks = allChunks.sort((a, b) => b.score - a.score);

    // Track candidates before reranking for metrics
    const candidatesBeforeRerank = sortedChunks.length;
    let rerankerLatency = 0;

    // Apply reranking if enabled and we have more chunks than target
    if (RERANKER_CONFIG.enabled && sortedChunks.length > targetChunks) {
      try {
        const rerankerStartTime = Date.now();

        // Create combined query from all search queries for reranking
        const combinedQuery = ragPlan.search_queries.join(' ');

        logger.debug({
          courseId,
          sectionId,
          candidateCount: sortedChunks.length,
          targetCount: targetChunks,
        }, '[Section RAG] Starting reranking');

        // Rerank all candidates
        const reranked: RerankResult[] = await rerankDocuments(
          combinedQuery,
          sortedChunks.map(chunk => chunk.content),
          targetChunks
        );

        rerankerLatency = Date.now() - rerankerStartTime;

        // Map reranked results back to original chunks
        const rerankedChunks = reranked.map(result => ({
          ...sortedChunks[result.index],
          score: result.relevance_score, // Override with reranker score
        }));

        // Calculate score statistics
        const scores = rerankedChunks.map(c => c.score);
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

        logger.info({
          courseId,
          sectionId,
          latencyMs: rerankerLatency,
          candidateCount: sortedChunks.length,
          rerankedCount: rerankedChunks.length,
          scoreDistribution: {
            min: minScore.toFixed(3),
            max: maxScore.toFixed(3),
            avg: avgScore.toFixed(3),
          },
        }, '[Section RAG] Reranking completed successfully');

        sortedChunks = rerankedChunks;

      } catch (rerankerError) {
        if (RERANKER_CONFIG.fallbackOnError) {
          logger.warn({
            err: rerankerError instanceof Error ? rerankerError.message : String(rerankerError),
            courseId,
            sectionId,
          }, '[Section RAG] Reranker failed - falling back to Qdrant scores');

          // Fallback: use original Qdrant scores
          sortedChunks = sortedChunks.slice(0, Math.min(targetChunks, SECTION_RAG_DEFAULTS.MAX_CHUNKS));
        } else {
          throw rerankerError;
        }
      }
    } else {
      // No reranking needed, just take top chunks
      sortedChunks = sortedChunks.slice(0, Math.min(targetChunks, SECTION_RAG_DEFAULTS.MAX_CHUNKS));

      logger.debug({
        courseId,
        sectionId,
        rerankerEnabled: RERANKER_CONFIG.enabled,
        chunkCount: sortedChunks.length,
        targetCount: targetChunks,
      }, '[Section RAG] Reranking skipped (disabled or insufficient candidates)');
    }

    // Calculate coverage score
    const coverageScore = calculateCoverageScore(
      sortedChunks,
      ragPlan.expected_topics
    );

    const retrievalDurationMs = Date.now() - startTime;

    logger.info({
      courseId,
      sectionId,
      totalRetrieved: sortedChunks.length,
      queriesUsed: successfulQueries.length,
      queriesTotal: ragPlan.search_queries.length,
      coverageScore: coverageScore.toFixed(2),
      durationMs: retrievalDurationMs,
    }, '[Section RAG] Retrieval complete');

    // Log trace for observability in TraceViewer
    try {
      const scores = sortedChunks.map(c => c.score);
      await logTrace({
        courseId,
        stage: 'stage_5',
        phase: 'rag_retrieval',
        stepName: 'section_rerank',
        inputData: {
          sectionId,
          queriesCount: ragPlan.search_queries.length,
          targetChunks,
        },
        outputData: {
          rerankerEnabled: RERANKER_CONFIG.enabled,
          candidatesCount: candidatesBeforeRerank,
          rerankedCount: sortedChunks.length,
          rerankerLatencyMs: rerankerLatency,
          scoreDistribution: sortedChunks.length > 0 ? {
            min: Math.min(...scores),
            max: Math.max(...scores),
            avg: scores.reduce((s, c) => s + c, 0) / scores.length,
          } : { min: 0, max: 0, avg: 0 },
          coverageScore,
        },
        durationMs: retrievalDurationMs,
      });
    } catch (traceError) {
      // Don't fail retrieval if trace logging fails
      logger.warn({
        err: traceError instanceof Error ? traceError.message : String(traceError),
        sectionId,
      }, '[Section RAG] Failed to log trace');
    }

    return {
      sectionId,
      chunks: sortedChunks,
      totalRetrieved: sortedChunks.length,
      searchQueriesUsed: successfulQueries,
      coverageScore,
      retrievalDurationMs,
    };

  } catch (error) {
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      courseId,
      sectionId,
    }, '[Section RAG] Retrieval failed - returning empty result');

    return createEmptyResult(sectionId, Date.now() - startTime);
  }
}

/**
 * Calculates coverage score based on expected topics found in chunks
 *
 * Checks how many expected topics appear in the retrieved chunk content.
 * Uses case-insensitive matching.
 *
 * @param chunks - Retrieved RAG chunks
 * @param expectedTopics - Topics expected to be found
 * @returns Coverage score between 0 and 1
 *
 * @example
 * ```typescript
 * const score = calculateCoverageScore(
 *   chunks,
 *   ['neural networks', 'backpropagation', 'gradient descent']
 * );
 * // Returns: 0.67 (if 2 of 3 topics found)
 * ```
 */
export function calculateCoverageScore(
  chunks: RAGChunk[],
  expectedTopics: string[]
): number {
  if (!expectedTopics || expectedTopics.length === 0) {
    return 1.0; // No expectations = full coverage
  }

  if (!chunks || chunks.length === 0) {
    return 0.0; // No chunks = no coverage
  }

  // Combine all chunk content for searching
  const combinedContent = chunks
    .map((chunk) => chunk.content.toLowerCase())
    .join(' ');

  // Count topics found
  let topicsFound = 0;
  for (const topic of expectedTopics) {
    const normalizedTopic = topic.toLowerCase().trim();
    if (combinedContent.includes(normalizedTopic)) {
      topicsFound++;
    }
  }

  return topicsFound / expectedTopics.length;
}

/**
 * Formats RAG chunks as XML for injection into generation prompts
 *
 * Creates a structured XML format that can be easily parsed by the LLM.
 * Truncates content if total exceeds maxTokens budget.
 *
 * @param chunks - RAG chunks to format
 * @param sectionId - Section identifier for XML attribute
 * @param maxTokens - Maximum token budget (default: 40000)
 * @returns Formatted XML string
 *
 * @example
 * ```typescript
 * const xml = formatChunksForPrompt(chunks, '1', 40000);
 * // Returns:
 * // <rag_context section_id="1">
 * //   <chunk document="file.pdf" heading="Chapter 1 > Intro" score="0.92">
 * //     Content here...
 * //   </chunk>
 * //   ...
 * // </rag_context>
 * ```
 */
export function formatChunksForPrompt(
  chunks: RAGChunk[],
  sectionId: string,
  maxTokens: number = SECTION_RAG_DEFAULTS.MAX_TOKENS
): string {
  if (!chunks || chunks.length === 0) {
    return `<rag_context section_id="${sectionId}">\n  <!-- No RAG chunks available -->\n</rag_context>`;
  }

  const xmlParts: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  // Reserve tokens for XML wrapper
  const wrapperOverhead = 100; // Approximate tokens for opening/closing tags
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

  return `<rag_context section_id="${sectionId}" chunks="${xmlParts.length}" total_available="${chunks.length}">${truncationNote}\n${content}\n</rag_context>`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Executes a single search query against Qdrant
 *
 * @param params - Search parameters
 * @returns Array of RAG chunks
 */
async function executeSearchQuery(params: {
  query: string;
  courseId: string;
  primaryDocuments?: string[];
  scoreThreshold: number;
  limit: number;
}): Promise<Omit<RAGChunk, 'matchedQuery'>[]> {
  const { query, courseId, primaryDocuments, scoreThreshold, limit } = params;

  const searchOptions: SearchOptions = {
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

  const response = await searchChunks(query, searchOptions);

  return response.results.map((result: SearchResult) => ({
    chunkId: result.chunk_id,
    documentId: result.document_id,
    documentName: result.document_name,
    content: result.content,
    headingPath: result.heading_path,
    score: result.score,
  }));
}

/**
 * Formats a single chunk as XML
 *
 * @param chunk - RAG chunk to format
 * @returns XML string for the chunk
 */
function formatSingleChunk(chunk: RAGChunk): string {
  // Escape XML special characters in content
  const escapedContent = escapeXml(chunk.content);
  const escapedHeading = escapeXml(chunk.headingPath);
  const escapedDocument = escapeXml(chunk.documentName);

  return `  <chunk document="${escapedDocument}" heading="${escapedHeading}" score="${chunk.score.toFixed(2)}">
${escapedContent}
  </chunk>`;
}

/**
 * Escapes XML special characters
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
 * Creates an empty result for failed or empty retrievals
 *
 * @param sectionId - Section identifier
 * @param durationMs - Duration of attempted retrieval
 * @returns Empty SectionRAGResult
 */
function createEmptyResult(sectionId: string, durationMs: number): SectionRAGResult {
  return {
    sectionId,
    chunks: [],
    totalRetrieved: 0,
    searchQueriesUsed: [],
    coverageScore: 0,
    retrievalDurationMs: durationMs,
  };
}

// ============================================================================
// BATCH RETRIEVAL
// ============================================================================

/**
 * Retrieves RAG context for multiple sections in parallel
 *
 * Useful for batch processing when generating multiple sections.
 *
 * @param params - Array of section RAG parameters
 * @returns Map of section ID to RAG result
 *
 * @example
 * ```typescript
 * const results = await retrieveMultipleSections([
 *   { courseId: 'c1', sectionId: '1', ragPlan: plan1 },
 *   { courseId: 'c1', sectionId: '2', ragPlan: plan2 },
 * ]);
 * // Returns: Map { '1' => result1, '2' => result2 }
 * ```
 */
export async function retrieveMultipleSections(
  params: SectionRAGParams[]
): Promise<Map<string, SectionRAGResult>> {
  const results = new Map<string, SectionRAGResult>();

  // Execute in parallel with Promise.all
  const promises = params.map(async (param) => {
    const result = await retrieveSectionContext(param);
    return { sectionId: param.sectionId, result };
  });

  const settled = await Promise.allSettled(promises);

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.set(outcome.value.sectionId, outcome.value.result);
    } else {
      logger.error({
        err: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      }, '[Section RAG] Batch retrieval item failed');
    }
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SECTION_RAG_DEFAULTS };
