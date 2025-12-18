/**
 * Context Cache Manager - In-memory cache for static regeneration context
 *
 * Caches static course metadata and style guide content to reduce token costs
 * and latency when regenerating multiple blocks in the same session.
 *
 * Static context includes:
 * - Course metadata (title, description, target_audience)
 * - Style Guide prompts
 * - Learning Objectives list
 * - Section structure overview
 *
 * Dynamic context (not cached):
 * - Target field value being regenerated
 * - User instruction
 * - Adjacent lesson details (may change)
 *
 * @module shared/regeneration/context-cache-manager
 */

import type { ContextTier } from '@megacampus/shared-types/regeneration-types';
import logger from '@/shared/logger';

/**
 * Cache entry with content and metadata
 */
interface CacheEntry {
  /** Cached static context content */
  content: string;
  /** Estimated token count for the cached content */
  tokenEstimate: number;
  /** Timestamp when entry was created (ms since epoch) */
  createdAt: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/**
 * Cache statistics for monitoring
 */
interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  entries: number;
}

/**
 * Context Cache Manager
 *
 * Provides in-memory caching for static regeneration context with TTL-based expiration.
 * Uses course ID + tier as cache key to ensure context consistency within a session.
 *
 * Features:
 * - Session-based caching (5-minute TTL)
 * - Automatic expiration cleanup
 * - Cache invalidation by course ID
 * - Statistics tracking (hits/misses)
 *
 * @example
 * ```typescript
 * const cacheKey = contextCacheManager.getCacheKey(courseId, 'global');
 * const cached = contextCacheManager.get(cacheKey);
 *
 * if (cached) {
 *   console.log('Cache hit!', cached.tokenEstimate);
 * } else {
 *   const staticContext = assembleStaticContext(...);
 *   contextCacheManager.set(cacheKey, staticContext, tokenEstimate);
 * }
 * ```
 */
export class ContextCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    entries: 0,
  };

  /**
   * Default cache TTL: 5 minutes (in milliseconds)
   *
   * Rationale: Long enough for multi-block editing sessions,
   * short enough to avoid stale data issues.
   */
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000;

  /**
   * Generate cache key from course ID and tier
   *
   * Format: `${courseId}:${tier}`
   * Example: "550e8400-e29b-41d4-a716-446655440000:global"
   *
   * @param courseId - Course UUID
   * @param tier - Context tier (atomic/local/structural/global)
   * @returns Cache key string
   */
  getCacheKey(courseId: string, tier: ContextTier): string {
    return `${courseId}:${tier}`;
  }

  /**
   * Get cached context entry
   *
   * Returns null if:
   * - Entry doesn't exist
   * - Entry has expired (past TTL)
   *
   * Automatically removes expired entries.
   *
   * @param key - Cache key (from getCacheKey)
   * @returns Cached entry or null
   */
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      logger.debug({ key, reason: 'not_found' }, 'ContextCache: Cache miss');
      return null;
    }

    // Check TTL expiration
    const age = Date.now() - entry.createdAt;
    if (age > entry.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.entries = this.cache.size;

      logger.debug(
        {
          key,
          age,
          ttlMs: entry.ttlMs,
          reason: 'expired',
        },
        'ContextCache: Cache miss (expired)'
      );

      return null;
    }

    this.stats.hits++;
    logger.debug(
      {
        key,
        age,
        tokenEstimate: entry.tokenEstimate,
        hitRate: this.getHitRate(),
      },
      'ContextCache: Cache hit'
    );

    return entry;
  }

  /**
   * Store context in cache
   *
   * @param key - Cache key (from getCacheKey)
   * @param content - Static context content to cache
   * @param tokenEstimate - Estimated token count for the content
   * @param ttlMs - Optional custom TTL (defaults to 5 minutes)
   */
  set(
    key: string,
    content: string,
    tokenEstimate: number,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    const entry: CacheEntry = {
      content,
      tokenEstimate,
      createdAt: Date.now(),
      ttlMs,
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;

    logger.debug(
      {
        key,
        tokenEstimate,
        ttlMs,
        entries: this.stats.entries,
      },
      'ContextCache: Entry cached'
    );
  }

  /**
   * Invalidate all cache entries for a specific course
   *
   * Use when course content changes (e.g., after regeneration)
   * to ensure fresh context on next request.
   *
   * @param courseId - Course UUID to invalidate
   * @returns Number of entries removed
   */
  invalidate(courseId: string): number {
    let removed = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(courseId)) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.invalidations++;
    this.stats.entries = this.cache.size;

    logger.info(
      {
        courseId,
        removed,
        remainingEntries: this.stats.entries,
      },
      'ContextCache: Course cache invalidated'
    );

    return removed;
  }

  /**
   * Clear all cache entries
   *
   * Useful for testing or manual cache refresh.
   */
  clear(): void {
    const entriesCleared = this.cache.size;
    this.cache.clear();
    this.stats.entries = 0;

    logger.info({ entriesCleared }, 'ContextCache: All entries cleared');
  }

  /**
   * Get current cache statistics
   *
   * @returns Cache stats (hits, misses, hit rate, entries)
   */
  getStats(): CacheStats & { hitRate: number } {
    return {
      ...this.stats,
      hitRate: this.getHitRate(),
    };
  }

  /**
   * Calculate cache hit rate
   *
   * @returns Hit rate as percentage (0-1)
   */
  private getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Clean up expired entries (manual cleanup)
   *
   * Automatically called by get(), but can be called manually
   * for proactive cleanup.
   *
   * @returns Number of entries removed
   */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.createdAt;
      if (age > entry.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.entries = this.cache.size;

    if (removed > 0) {
      logger.debug(
        {
          removed,
          remainingEntries: this.stats.entries,
        },
        'ContextCache: Expired entries cleaned up'
      );
    }

    return removed;
  }
}

/**
 * Singleton instance for global use
 *
 * Import this instance to use the cache across the application.
 *
 * @example
 * ```typescript
 * import { contextCacheManager } from './context-cache-manager';
 *
 * const key = contextCacheManager.getCacheKey(courseId, 'global');
 * const cached = contextCacheManager.get(key);
 * ```
 */
export const contextCacheManager = new ContextCacheManager();
