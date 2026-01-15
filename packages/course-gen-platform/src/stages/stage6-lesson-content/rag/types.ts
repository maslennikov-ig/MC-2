import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * Internal RAG chunk representation for lesson retrieval
 * Maps from Qdrant SearchResult to RAGChunk format
 */
export interface LessonRAGChunk {
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
  /** Document priority (optional, from chunk metadata) */
  document_priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}

/**
 * Source document attribution from retrieved chunks
 * Tracks which documents contributed to lesson content generation
 * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
 */
export interface SourceDocument {
  /** Document UUID from file_catalog */
  document_id: string;
  /** Document filename */
  document_name: string;
  /** Document priority from file_catalog */
  document_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  /** Number of chunks retrieved from this document */
  chunk_count: number;
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
  /**
   * Enable priority-based score boosting for CORE/IMPORTANT documents
   * @default true
   * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
   */
  enablePriorityBoost?: boolean;
}

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
