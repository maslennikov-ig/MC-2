/**
 * Stale-While-Revalidate Cache Implementation
 * @module shared/llm/stale-while-revalidate-cache
 *
 * Industry-standard caching pattern extracted from model-config-service.ts
 */

import logger from '../logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Cache result with staleness indicator
 */
export interface CacheResult<T> {
  /** Cached data */
  data: T;
  /** Whether the data is stale (past TTL) */
  isStale: boolean;
  /** Age of the cache entry in milliseconds */
  age: number;
}

/** Default fresh TTL: 5 minutes */
const DEFAULT_FRESH_TTL_MS = 5 * 60 * 1000;

/** Maximum age for cache entries: 24 hours (after which they are evicted) */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Stale-While-Revalidate Cache Implementation
 *
 * Industry-standard pattern used by Netflix, Spotify, AWS for resilient configuration management.
 *
 * Key principles:
 * 1. Never auto-deletes stale entries within 24h - stale data is better than nothing
 * 2. Evicts entries older than 24h to prevent unbounded memory growth
 * 3. Returns staleness indicator so caller can decide to log warnings
 * 4. Supports explicit failure when no cache and DB unavailable
 *
 * Flow:
 * 1. Check cache: fresh (TTL < 5min) → return immediately
 * 2. Stale or miss → try database
 * 3. DB success → update cache → return fresh data
 * 4. DB failure + stale cache (< 24h) → return stale with WARNING
 * 5. DB failure + no cache or expired (> 24h) → explicit error
 */
export class StaleWhileRevalidateCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly freshTTL: number;
  private readonly maxAge: number;

  constructor(freshTTLMs: number = DEFAULT_FRESH_TTL_MS, maxAgeMs: number = MAX_CACHE_AGE_MS) {
    this.freshTTL = freshTTLMs;
    this.maxAge = maxAgeMs;
  }

  /**
   * Get cached data with staleness indicator
   * Entries older than maxAge (24h) are evicted to prevent unbounded memory growth
   *
   * @param key - Cache key
   * @returns CacheResult with data, isStale flag, and age in ms, or null if not found/expired
   */
  get(key: string): CacheResult<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;

    // Evict entries older than maxAge (24h) to prevent unbounded memory growth
    if (age > this.maxAge) {
      this.cache.delete(key);
      logger.info(
        { key, ageHours: Math.round(age / 3600000) },
        'Cache entry evicted (exceeded 24h max age)'
      );
      return null;
    }

    const isStale = age > this.freshTTL;

    return {
      data: entry.data,
      isStale,
      age,
    };
  }

  /**
   * Store fresh data in cache
   *
   * @param key - Cache key
   * @param data - Data to cache
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if key has any data (fresh or stale, but not expired)
   *
   * @param key - Cache key
   * @returns true if valid data exists for this key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; oldestAgeMs: number } {
    let oldestAge = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      size: this.cache.size,
      oldestAgeMs: oldestAge,
    };
  }
}
