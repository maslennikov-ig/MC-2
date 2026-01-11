/**
 * Qdrant search type definitions
 *
 * @module shared/qdrant/search-types
 */

/**
 * Search result item
 */
export interface SearchResult {
  /** Chunk ID */
  chunk_id: string;
  /** Parent chunk ID */
  parent_chunk_id: string | null | undefined;
  /** Chunk level */
  level: 'parent' | 'child';
  /** Chunk content */
  content: string;
  /** Heading path */
  heading_path: string;
  /** Chapter */
  chapter: string | null | undefined;
  /** Section */
  section: string | null | undefined;
  /** Document ID */
  document_id: string;
  /** Document name */
  document_name: string;
  /** Page number */
  page_number: number | null | undefined;
  /** Page range */
  page_range: [number, number] | null | undefined;
  /** Token count */
  token_count: number;
  /** Similarity score (0-1) */
  score: number;
  /** Content metadata */
  metadata: {
    has_code: boolean | undefined;
    has_formulas: boolean | undefined;
    has_tables: boolean | undefined;
    has_images: boolean | undefined;
  };
  /** Full payload (for advanced use) */
  payload?: Record<string, unknown>;
}

/**
 * Search filters for multi-tenancy and content filtering
 */
export interface SearchFilters {
  /** Organization ID (required for multi-tenancy) */
  organization_id?: string;
  /** Course ID (required for course-specific search) */
  course_id?: string;
  /** Document IDs to search within */
  document_ids?: string[];
  /** Chunk level filter */
  level?: 'parent' | 'child';
  /** Chapter filter */
  chapter?: string;
  /** Section filter */
  section?: string;
  /** Content filters */
  has_code?: boolean;
  has_formulas?: boolean;
  has_tables?: boolean;
  has_images?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Number of results to return (default: 10) */
  limit?: number;
  /** Similarity score threshold (0-1, default: 0.7) */
  score_threshold?: number;
  /** Collection name (default: 'course_embeddings') */
  collection_name?: string;
  /** Enable hybrid search (dense + sparse, default: false) */
  enable_hybrid?: boolean;
  /** Return full payload (default: false) */
  include_payload?: boolean;
  /** Search filters */
  filters?: SearchFilters;
  /**
   * Enable priority boosting based on document_priority/document_weight
   * Boosts scores for CORE/IMPORTANT documents
   * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
   */
  enable_priority_boost?: boolean;
  /**
   * Priority boost factor for document priority scoring.
   *
   * Formula: finalScore = baseScore * (1 + (document_weight - 0.5) * priority_boost_factor)
   *
   * Examples with priority_boost_factor = 0.4 (default):
   * - CORE document (weight=1.0): score * 1.2 (+20% boost)
   * - IMPORTANT document (weight=0.8): score * 1.12 (+12% boost)
   * - SUPPLEMENTARY document (weight=0.5): score * 1.0 (no change)
   *
   * Score calculation breakdown:
   * - CORE: 1 + (1.0 - 0.5) * 0.4 = 1 + 0.5 * 0.4 = 1.2
   * - IMPORTANT: 1 + (0.8 - 0.5) * 0.4 = 1 + 0.3 * 0.4 = 1.12
   * - SUPPLEMENTARY: 1 + (0.5 - 0.5) * 0.4 = 1 + 0 * 0.4 = 1.0
   *
   * Tuning guidelines:
   * - 0.2 = subtle boost (CORE gets +10%, barely noticeable)
   * - 0.4 = balanced (CORE gets +20%, recommended default)
   * - 0.8 = aggressive (CORE gets +40%, may overwhelm semantic relevance)
   *
   * @default 0.4
   * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
   */
  priority_boost_factor?: number;
}

/**
 * Search result metadata
 */
export interface SearchMetadata {
  /** Total results found */
  total_results: number;
  /** Search type used */
  search_type: 'dense' | 'hybrid';
  /** Query embedding time (ms) */
  embedding_time_ms: number;
  /** Search time (ms) */
  search_time_ms: number;
  /** Applied filters */
  filters_applied: SearchFilters;
}

/**
 * Complete search response
 */
export interface SearchResponse {
  /** Search results */
  results: SearchResult[];
  /** Search metadata */
  metadata: SearchMetadata;
}
