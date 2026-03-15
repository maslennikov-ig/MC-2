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
import type { SectionRAGResult, RAGChunk } from './section-rag-retriever';
import {
  persistToSupabase,
  loadFromSupabaseByContextId,
  loadCourseFromSupabase,
  clearCourseFromSupabase,
} from './rag-cache-persistence';

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
  /** Maximum cache entries before eviction */
  private static readonly MAX_ENTRIES = 5000;

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

  constructor(config?: RAGCacheConfig) {
    this.cache = new Map();
    this.courseEntries = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0 };

    logger.debug(
      {
        maxEntriesPerCourse: this.config.maxEntriesPerCourse,
        enablePersistence: this.config.enablePersistence,
      },
      '[RAG Cache] Initialized'
    );
  }

  /**
   * Store RAG context for a section
   */
  async store(courseId: string, sectionId: string, result: SectionRAGResult): Promise<string> {
    // Evict oldest entries if cache exceeds max size
    if (this.cache.size >= RAGContextCache.MAX_ENTRIES) {
      const toEvict = Math.floor(this.cache.size * 0.2);
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < toEvict; i++) {
        const key = keys[i];
        const entry = this.cache.get(key);
        if (entry) {
          const courseSet = this.courseEntries.get(entry.courseId);
          if (courseSet) {
            courseSet.delete(key);
            if (courseSet.size === 0) {
              this.courseEntries.delete(entry.courseId);
            }
          }
        }
        this.cache.delete(key);
      }
      logger.warn(
        { evicted: toEvict, remaining: this.cache.size },
        '[RAGContextCache] Evicted entries due to max size'
      );
    }

    const ragContextId = this.generateContextId(courseId, sectionId);

    const entry: CachedRAGContext = {
      ragContextId,
      courseId,
      sectionId,
      chunks: result.chunks || [],
      retrievedAt: new Date(),
      coverageScore: result.coverageScore,
      searchQueriesUsed: result.searchQueriesUsed || [],
    };

    this.enforceLimit(courseId);
    this.cache.set(ragContextId, entry);

    if (!this.courseEntries.has(courseId)) {
      this.courseEntries.set(courseId, new Set());
    }
    this.courseEntries.get(courseId)!.add(ragContextId);

    logger.debug(
      {
        ragContextId,
        courseId,
        sectionId,
        chunkCount: entry.chunks.length,
        coverageScore: entry.coverageScore.toFixed(2),
      },
      '[RAG Cache] Stored context'
    );

    if (this.config.enablePersistence) {
      await persistToSupabase(entry);
    }

    return ragContextId;
  }

  /**
   * Retrieve cached RAG context by ID
   */
  async get(ragContextId: string): Promise<CachedRAGContext | null> {
    const cached = this.cache.get(ragContextId);

    if (cached) {
      this.stats.hits++;
      logger.debug({ ragContextId, source: 'memory' }, '[RAG Cache] Cache hit');
      return cached;
    }

    if (this.config.enablePersistence) {
      const persisted = await loadFromSupabaseByContextId(ragContextId);
      if (persisted) {
        this.cache.set(ragContextId, persisted);
        if (!this.courseEntries.has(persisted.courseId)) {
          this.courseEntries.set(persisted.courseId, new Set());
        }
        this.courseEntries.get(persisted.courseId)!.add(ragContextId);

        this.stats.hits++;
        logger.debug(
          { ragContextId, source: 'supabase' },
          '[RAG Cache] Cache hit (from persistence)'
        );
        return persisted;
      }
    }

    this.stats.misses++;
    logger.debug({ ragContextId }, '[RAG Cache] Cache miss');
    return null;
  }

  /**
   * Check if context exists in cache (in-memory only)
   */
  has(ragContextId: string): boolean {
    return this.cache.has(ragContextId);
  }

  /**
   * Get or retrieve RAG context (cache-first strategy)
   */
  async getOrRetrieve(
    courseId: string,
    sectionId: string,
    ragContextId: string,
    retriever: () => Promise<SectionRAGResult>
  ): Promise<CachedRAGContext> {
    const cached = await this.get(ragContextId);
    if (cached) {
      return cached;
    }

    logger.debug(
      { ragContextId, courseId, sectionId },
      '[RAG Cache] Cache miss - retrieving fresh context'
    );

    const result = await retriever();

    const entry: CachedRAGContext = {
      ragContextId,
      courseId,
      sectionId,
      chunks: result.chunks || [],
      retrievedAt: new Date(),
      coverageScore: result.coverageScore,
      searchQueriesUsed: result.searchQueriesUsed || [],
    };

    this.enforceLimit(courseId);
    this.cache.set(ragContextId, entry);

    if (!this.courseEntries.has(courseId)) {
      this.courseEntries.set(courseId, new Set());
    }
    this.courseEntries.get(courseId)!.add(ragContextId);

    if (this.config.enablePersistence) {
      await persistToSupabase(entry);
    }

    logger.debug(
      { ragContextId, chunkCount: entry.chunks.length },
      '[RAG Cache] Stored fresh context'
    );

    return entry;
  }

  /**
   * Clear all cached contexts for a course
   */
  async clearCourse(courseId: string): Promise<void> {
    const contextIds = this.courseEntries.get(courseId);

    if (!contextIds || contextIds.size === 0) {
      logger.debug({ courseId }, '[RAG Cache] No entries to clear for course');
      return;
    }

    const count = contextIds.size;

    for (const contextId of contextIds) {
      this.cache.delete(contextId);
    }
    this.courseEntries.delete(courseId);

    if (this.config.enablePersistence) {
      await clearCourseFromSupabase(courseId);
    }

    logger.info({ courseId, entriesCleared: count }, '[RAG Cache] Cleared course entries');
  }

  /**
   * Clear entire cache (memory only, not Supabase)
   */
  async clear(): Promise<void> {
    const totalEntries = this.cache.size;
    const courseCount = this.courseEntries.size;

    this.cache.clear();
    this.courseEntries.clear();
    this.stats = { hits: 0, misses: 0 };

    logger.info(
      { entriesCleared: totalEntries, coursesCleared: courseCount },
      '[RAG Cache] Cache cleared'
    );
    return Promise.resolve();
  }

  /**
   * Get cache statistics
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

  private generateContextId(courseId: string, sectionId: string): string {
    const timestamp = Date.now();
    return `rag_${courseId}_${sectionId}_${timestamp}`;
  }

  private enforceLimit(courseId: string): void {
    const contextIds = this.courseEntries.get(courseId);
    if (!contextIds) return;

    if (contextIds.size >= this.config.maxEntriesPerCourse) {
      const entries: CachedRAGContext[] = [];
      for (const id of contextIds) {
        const entry = this.cache.get(id);
        if (entry) entries.push(entry);
      }

      entries.sort((a, b) => a.retrievedAt.getTime() - b.retrievedAt.getTime());

      const toRemove = entries.slice(0, Math.ceil(contextIds.size * 0.2));

      for (const entry of toRemove) {
        this.cache.delete(entry.ragContextId);
        contextIds.delete(entry.ragContextId);
      }

      logger.debug(
        { courseId, removed: toRemove.length, remaining: contextIds.size },
        '[RAG Cache] Evicted oldest entries'
      );
    }
  }

  /**
   * Load cache entries from Supabase for a course (public for external hydration)
   */
  async loadFromSupabase(courseId: string): Promise<void> {
    const entries = await loadCourseFromSupabase(courseId);

    for (const entry of entries) {
      this.cache.set(entry.ragContextId, entry);

      if (!this.courseEntries.has(courseId)) {
        this.courseEntries.set(courseId, new Set());
      }
      this.courseEntries.get(courseId)!.add(entry.ragContextId);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton RAG Context Cache instance
 *
 * @example
 * ```typescript
 * import { ragContextCache } from './rag-context-cache';
 *
 * const ragContextId = await ragContextCache.store(courseId, sectionId, result);
 * const cached = await ragContextCache.get(ragContextId);
 * await ragContextCache.clearCourse(courseId);
 * ```
 */
export const ragContextCache = new RAGContextCache();
