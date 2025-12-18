/**
 * RAG Context Cache Service
 * Stores retrieved chunks by rag_context_id for retry consistency
 *
 * When a lesson generation fails and needs to retry, it should use the exact same
 * RAG context that was used in the original attempt, ensuring deterministic regeneration.
 *
 * Features:
 * - In-memory Map for current job execution
 * - Optional Supabase persistence for cross-worker sharing
 * - Course-scoped cleanup after job completion
 * - Hit/miss statistics for observability
 *
 * @module stages/stage5-generation/utils/rag-context-cache
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import { logger } from '@/shared/logger';
import type { RAGChunk, SectionRAGResult } from './section-rag-retriever';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE TABLE TYPES (Schema T012)
// ============================================================================

/**
 * Temporary schema definition for rag_context_cache table
 * Overrides Database types until migration T012 is fully applied/generated
 */
interface RAGContextCacheTable {
  Row: {
    id: string;
    course_id: string;
    section_id: string;
    rag_context_id: string;
    chunks: RAGChunk[];
    coverage_score: number | null;
    search_queries_used: string[] | null;
    created_at: string;
    expires_at: string | null;
  };
  Insert: {
    id?: string;
    course_id: string;
    section_id: string;
    rag_context_id: string;
    chunks: RAGChunk[];
    coverage_score?: number | null;
    search_queries_used?: string[] | null;
    created_at?: string;
    expires_at?: string | null;
  };
  Update: {
    id?: string;
    course_id?: string;
    section_id?: string;
    rag_context_id?: string;
    chunks?: RAGChunk[];
    coverage_score?: number | null;
    search_queries_used?: string[] | null;
    created_at?: string;
    expires_at?: string | null;
  };
  Relationships: [];
}

// Augmented Database type for this file (simplified to avoid Omit issues)
type LocalDatabase = {
  public: {
    Tables: {
      rag_context_cache: RAGContextCacheTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ============================================================================
// TYPES
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cached RAG context entry
 */
export interface CachedRAGContext {
  /** Unique cache key (format: rag_{courseId}_{sectionId}_{timestamp}) */
  ragContextId: string;
  /** Course UUID */
  courseId: string;
  /** Section ID from sections_breakdown */
  sectionId: string;
  /** Retrieved RAG chunks */
  chunks: RAGChunk[];
  /** When the context was retrieved */
  retrievedAt: Date;
  /** Coverage score (0-1): expected_topics found / total expected */
  coverageScore: number;
  /** Queries that successfully retrieved results */
  searchQueriesUsed: string[];
}

/**
 * Cache configuration options
 */
export interface RAGCacheConfig {
  /** Maximum entries to cache per course (default: 50) */
  maxEntriesPerCourse?: number;
  /** Enable Supabase persistence (default: false) */
  enablePersistence?: boolean;
}

/**
 * Cache statistics for observability
 */
export interface RAGCacheStats {
  /** Total entries across all courses */
  totalEntries: number;
  /** Number of courses with cached entries */
  courseCount: number;
  /** Cache hit rate (hits / total requests) */
  hitRate: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<RAGCacheConfig> = {
  maxEntriesPerCourse: 50,
  enablePersistence: false,
};

// ============================================================================
// RAG CONTEXT CACHE CLASS
// ============================================================================

/**
 * RAG Context Cache Service
 *
 * Provides cache-first retrieval for RAG contexts, ensuring retry consistency.
 * Supports both in-memory caching and optional Supabase persistence.
 *
 * @example
 * ```typescript
 * import { ragContextCache, RAGContextCache } from './rag-context-cache';
 *
 * // Store after retrieval
 * const result = await retrieveSectionContext(params);
 * const ragContextId = await ragContextCache.store(courseId, sectionId, result);
 *
 * // On retry, get from cache (ensures same context)
 * const cached = await ragContextCache.get(ragContextId);
 * if (cached) {
 *   // Use cached.chunks instead of re-retrieving
 * }
 *
 * // After job completion
 * await ragContextCache.clearCourse(courseId);
 * ```
 */
export class RAGContextCache {
  /** In-memory cache: ragContextId -> CachedRAGContext */
  private cache: Map<string, CachedRAGContext>;

  /** Course entries index: courseId -> Set<ragContextId> */
  private courseEntries: Map<string, Set<string>>;

  /** Configuration */
  private config: Required<RAGCacheConfig>;

  /** Statistics */
  private stats: {
    hits: number;
    misses: number;
  };

  /**
   * Creates a new RAG Context Cache instance
   *
   * @param config - Cache configuration options
   *
   * @example
   * ```typescript
   * // Default configuration
   * const cache = new RAGContextCache();
   *
   * // With persistence enabled
   * const persistentCache = new RAGContextCache({
   *   enablePersistence: true,
   *   maxEntriesPerCourse: 100
   * });
   * ```
   */
  constructor(config?: RAGCacheConfig) {
    this.cache = new Map();
    this.courseEntries = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0 };

    logger.debug({
      maxEntriesPerCourse: this.config.maxEntriesPerCourse,
      enablePersistence: this.config.enablePersistence,
    }, '[RAG Cache] Initialized');
  }

  /**
   * Store RAG context for a section
   *
   * Generates a unique rag_context_id and stores the result in cache.
   * If persistence is enabled, also stores in Supabase.
   *
   * @param courseId - Course UUID
   * @param sectionId - Section ID from sections_breakdown
   * @param result - Section RAG result from retrieval
   * @returns The rag_context_id used as cache key
   *
   * @example
   * ```typescript
   * const result = await retrieveSectionContext({
   *   courseId: 'course-uuid-123',
   *   sectionId: '1',
   *   ragPlan: plan
   * });
   * const ragContextId = await ragContextCache.store(courseId, sectionId, result);
   * // ragContextId = 'rag_course-uuid-123_1_1700000000000'
   * ```
   */
  async store(
    courseId: string,
    sectionId: string,
    result: SectionRAGResult
  ): Promise<string> {
    // Generate unique rag_context_id
    const ragContextId = this.generateContextId(courseId, sectionId);

    // Create cache entry
    const entry: CachedRAGContext = {
      ragContextId,
      courseId,
      sectionId,
      chunks: result.chunks || [],
      retrievedAt: new Date(),
      coverageScore: result.coverageScore,
      searchQueriesUsed: result.searchQueriesUsed || [],
    };

    // Check course entry limit
    this.enforceLimit(courseId);

    // Store in memory
    this.cache.set(ragContextId, entry);

    // Update course index
    if (!this.courseEntries.has(courseId)) {
      this.courseEntries.set(courseId, new Set());
    }
    this.courseEntries.get(courseId)!.add(ragContextId);

    logger.debug({
      ragContextId,
      courseId,
      sectionId,
      chunkCount: entry.chunks.length,
      coverageScore: entry.coverageScore.toFixed(2),
    }, '[RAG Cache] Stored context');

    // Persist to Supabase if enabled
    if (this.config.enablePersistence) {
      await this.persistToSupabase(entry);
    }

    return ragContextId;
  }

  /**
   * Retrieve cached RAG context by ID
   *
   * First checks in-memory cache, then Supabase if persistence is enabled.
   *
   * @param ragContextId - The unique context identifier
   * @returns Cached context or null if not found
   *
   * @example
   * ```typescript
   * const cached = await ragContextCache.get('rag_course-uuid-123_1_1700000000000');
   * if (cached) {
   *   console.log(`Found ${cached.chunks.length} cached chunks`);
   * }
   * ```
   */
  async get(ragContextId: string): Promise<CachedRAGContext | null> {
    // Check in-memory cache first
    const cached = this.cache.get(ragContextId);

    if (cached) {
      this.stats.hits++;
      logger.debug({
        ragContextId,
        source: 'memory',
      }, '[RAG Cache] Cache hit');
      return cached;
    }

    // Try Supabase if persistence enabled
    if (this.config.enablePersistence) {
      const persisted = await this.loadFromSupabaseByContextId(ragContextId);
      if (persisted) {
        // Store back to memory cache
        this.cache.set(ragContextId, persisted);
        if (!this.courseEntries.has(persisted.courseId)) {
          this.courseEntries.set(persisted.courseId, new Set());
        }
        this.courseEntries.get(persisted.courseId)!.add(ragContextId);

        this.stats.hits++;
        logger.debug({
          ragContextId,
          source: 'supabase',
        }, '[RAG Cache] Cache hit (from persistence)');
        return persisted;
      }
    }

    this.stats.misses++;
    logger.debug({
      ragContextId,
    }, '[RAG Cache] Cache miss');
    return null;
  }

  /**
   * Check if context exists in cache
   *
   * Only checks in-memory cache (does not query Supabase).
   *
   * @param ragContextId - The unique context identifier
   * @returns True if context exists in memory cache
   *
   * @example
   * ```typescript
   * if (ragContextCache.has(ragContextId)) {
   *   // Use cached context
   * }
   * ```
   */
  has(ragContextId: string): boolean {
    return this.cache.has(ragContextId);
  }

  /**
   * Get or retrieve RAG context (cache-first strategy)
   *
   * Checks cache first. If cache miss, calls the provided retriever function,
   * stores the result, and returns the cached entry.
   *
   * @param courseId - Course UUID
   * @param sectionId - Section ID
   * @param ragContextId - The context ID to look up
   * @param retriever - Function to call if cache miss
   * @returns Cached context (from cache or freshly retrieved)
   *
   * @example
   * ```typescript
   * const cached = await ragContextCache.getOrRetrieve(
   *   courseId,
   *   sectionId,
   *   ragContextId,
   *   () => retrieveSectionContext({ courseId, sectionId, ragPlan })
   * );
   * // Always returns a CachedRAGContext
   * ```
   */
  async getOrRetrieve(
    courseId: string,
    sectionId: string,
    ragContextId: string,
    retriever: () => Promise<SectionRAGResult>
  ): Promise<CachedRAGContext> {
    // Try cache first
    const cached = await this.get(ragContextId);
    if (cached) {
      return cached;
    }

    // Cache miss - retrieve fresh context
    logger.debug({
      ragContextId,
      courseId,
      sectionId,
    }, '[RAG Cache] Cache miss - retrieving fresh context');

    const result = await retriever();

    // Store with the provided ragContextId (override generated one)
    const entry: CachedRAGContext = {
      ragContextId,
      courseId,
      sectionId,
      chunks: result.chunks || [],
      retrievedAt: new Date(),
      coverageScore: result.coverageScore,
      searchQueriesUsed: result.searchQueriesUsed || [],
    };

    // Enforce limit and store
    this.enforceLimit(courseId);

    this.cache.set(ragContextId, entry);

    if (!this.courseEntries.has(courseId)) {
      this.courseEntries.set(courseId, new Set());
    }
    this.courseEntries.get(courseId)!.add(ragContextId);

    if (this.config.enablePersistence) {
      await this.persistToSupabase(entry);
    }

    logger.debug({
      ragContextId,
      chunkCount: entry.chunks.length,
    }, '[RAG Cache] Stored fresh context');

    return entry;
  }

  /**
   * Clear all cached contexts for a course
   *
   * Should be called after job completion to free memory.
   * Also clears from Supabase if persistence is enabled.
   *
   * @param courseId - Course UUID
   *
   * @example
   * ```typescript
   * // After job completion
   * await ragContextCache.clearCourse(courseId);
   * ```
   */
  async clearCourse(courseId: string): Promise<void> {
    const contextIds = this.courseEntries.get(courseId);

    if (!contextIds || contextIds.size === 0) {
      logger.debug({
        courseId,
      }, '[RAG Cache] No entries to clear for course');
      return;
    }

    const count = contextIds.size;

    // Clear from memory
    for (const contextId of contextIds) {
      this.cache.delete(contextId);
    }
    this.courseEntries.delete(courseId);

    // Clear from Supabase if persistence enabled
    if (this.config.enablePersistence) {
      await this.clearCourseFromSupabase(courseId);
    }

    logger.info({
      courseId,
      entriesCleared: count,
    }, '[RAG Cache] Cleared course entries');
  }

  /**
   * Clear entire cache
   *
   * Removes all entries from memory. Does NOT clear Supabase.
   *
   * @example
   * ```typescript
   * await ragContextCache.clear();
   * ```
   */
  async clear(): Promise<void> {
    const totalEntries = this.cache.size;
    const courseCount = this.courseEntries.size;

    this.cache.clear();
    this.courseEntries.clear();
    this.stats = { hits: 0, misses: 0 };

    logger.info({
      entriesCleared: totalEntries,
      coursesCleared: courseCount,
    }, '[RAG Cache] Cache cleared');
    return Promise.resolve();
  }

  /**
   * Get cache statistics
   *
   * Returns current cache metrics for observability.
   *
   * @returns Cache statistics including entry count, course count, and hit rate
   *
   * @example
   * ```typescript
   * const stats = ragContextCache.getStats();
   * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   * ```
   */
  getStats(): RAGCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      totalEntries: this.cache.size,
      courseCount: this.courseEntries.size,
      hitRate,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generates a unique rag_context_id
   *
   * Format: rag_{courseId}_{sectionId}_{timestamp}
   *
   * @param courseId - Course UUID
   * @param sectionId - Section ID
   * @returns Unique context identifier
   */
  private generateContextId(courseId: string, sectionId: string): string {
    const timestamp = Date.now();
    return `rag_${courseId}_${sectionId}_${timestamp}`;
  }

  /**
   * Enforces maximum entries per course limit
   *
   * Removes oldest entries if limit exceeded (LRU-like behavior).
   *
   * @param courseId - Course UUID to check
   */
  private enforceLimit(courseId: string): void {
    const contextIds = this.courseEntries.get(courseId);
    if (!contextIds) return;

    if (contextIds.size >= this.config.maxEntriesPerCourse) {
      // Get entries sorted by retrievedAt (oldest first)
      const entries: CachedRAGContext[] = [];
      for (const id of contextIds) {
        const entry = this.cache.get(id);
        if (entry) entries.push(entry);
      }

      entries.sort((a, b) => a.retrievedAt.getTime() - b.retrievedAt.getTime());

      // Remove oldest entries to make room
      const toRemove = entries.slice(0, Math.ceil(contextIds.size * 0.2)); // Remove oldest 20%

      for (const entry of toRemove) {
        this.cache.delete(entry.ragContextId);
        contextIds.delete(entry.ragContextId);
      }

      logger.debug({
        courseId,
        removed: toRemove.length,
        remaining: contextIds.size,
      }, '[RAG Cache] Evicted oldest entries');
    }
  }

  /**
   * Persist cache entry to Supabase
   *
   * Uses rag_context_cache table from migration T012.
   *
   * @param entry - Cache entry to persist
   */
  private async persistToSupabase(entry: CachedRAGContext): Promise<void> {
    try {
      const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

      const { error } = await supabase
        .from('rag_context_cache')
        .upsert({
          course_id: entry.courseId,
          section_id: entry.sectionId,
          rag_context_id: entry.ragContextId,
          chunks: entry.chunks,
          coverage_score: entry.coverageScore,
          search_queries_used: entry.searchQueriesUsed,
          created_at: entry.retrievedAt.toISOString(),
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
        }, {
          onConflict: 'rag_context_id',
        });

      if (error) {
        logger.warn({
          err: error.message,
          ragContextId: entry.ragContextId,
        }, '[RAG Cache] Failed to persist to Supabase');
      } else {
        logger.debug({
          ragContextId: entry.ragContextId,
        }, '[RAG Cache] Persisted to Supabase');
      }
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        ragContextId: entry.ragContextId,
      }, '[RAG Cache] Supabase persistence error');
    }
  }

  /**
   * Load cache entry from Supabase by context ID
   *
   * @param ragContextId - Context ID to look up
   * @returns Cached context or null
   */
  private async loadFromSupabaseByContextId(
    ragContextId: string
  ): Promise<CachedRAGContext | null> {
    try {
      const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

      const { data, error } = await supabase
        .from('rag_context_cache')
        .select('*')
        .eq('rag_context_id', ragContextId)
        .single();

      if (error || !data) {
        return null;
      }

      const row = data as RAGContextCacheTable['Row'];

      // Check if expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        logger.debug({
          ragContextId,
        }, '[RAG Cache] Supabase entry expired');
        return null;
      }

      return {
        ragContextId: row.rag_context_id,
        courseId: row.course_id,
        sectionId: row.section_id,
        chunks: row.chunks,
        retrievedAt: new Date(row.created_at),
        coverageScore: row.coverage_score || 0,
        searchQueriesUsed: row.search_queries_used || [],
      };
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        ragContextId,
      }, '[RAG Cache] Failed to load from Supabase');
      return null;
    }
  }

  /**
   * Load cache entries from Supabase for a course
   *
   * Called when persistence is enabled to hydrate memory cache.
   * Can be called externally to pre-load cache for a course.
   *
   * @param courseId - Course UUID
   */
  async loadFromSupabase(courseId: string): Promise<void> {
    try {
      const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

      const { data, error } = await supabase
        .from('rag_context_cache')
        .select('*')
        .eq('course_id', courseId)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        logger.warn({
          err: error.message,
          courseId,
        }, '[RAG Cache] Failed to load from Supabase');
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      // Hydrate memory cache
      for (const item of data) {
        const row = item as RAGContextCacheTable['Row'];
        const entry: CachedRAGContext = {
          ragContextId: row.rag_context_id,
          courseId: row.course_id,
          sectionId: row.section_id,
          chunks: row.chunks,
          retrievedAt: new Date(row.created_at),
          coverageScore: row.coverage_score || 0,
          searchQueriesUsed: row.search_queries_used || [],
        };

        this.cache.set(entry.ragContextId, entry);

        if (!this.courseEntries.has(courseId)) {
          this.courseEntries.set(courseId, new Set());
        }
        this.courseEntries.get(courseId)!.add(entry.ragContextId);
      }

      logger.debug({
        courseId,
        entriesLoaded: data.length,
      }, '[RAG Cache] Loaded from Supabase');
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        courseId,
      }, '[RAG Cache] Supabase load error');
    }
  }

  /**
   * Clear course entries from Supabase
   *
   * @param courseId - Course UUID
   */
  private async clearCourseFromSupabase(courseId: string): Promise<void> {
    try {
      const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

      const { error } = await supabase
        .from('rag_context_cache')
        .delete()
        .eq('course_id', courseId);

      if (error) {
        logger.warn({
          err: error.message,
          courseId,
        }, '[RAG Cache] Failed to clear from Supabase');
      } else {
        logger.debug({
          courseId,
        }, '[RAG Cache] Cleared from Supabase');
      }
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        courseId,
      }, '[RAG Cache] Supabase clear error');
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton RAG Context Cache instance
 *
 * Shared across all phases in a generation job.
 * Use this instance unless you need isolated caching behavior.
 *
 * @example
 * ```typescript
 * import { ragContextCache } from './rag-context-cache';
 *
 * // Store context
 * const ragContextId = await ragContextCache.store(courseId, sectionId, result);
 *
 * // Retrieve context
 * const cached = await ragContextCache.get(ragContextId);
 *
 * // After job completion
 * await ragContextCache.clearCourse(courseId);
 * ```
 */
export const ragContextCache = new RAGContextCache();
