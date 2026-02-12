/**
 * Distributed Concurrency Limiter for Jina API
 *
 * Enforces Jina API's 2 concurrent requests limit across ALL processes,
 * worker threads, and servers using a Redis ZSET semaphore with heartbeat.
 *
 * Redis Key Design:
 * - Key: `jina:sem:{api_key_hash_8chars}` (ZSET)
 * - Score: expiration timestamp in ms (from Redis server time + slotTtlMs)
 * - Member: `{slot_uuid}` unique per acquire call
 * - Expired slots (score < now) are cleaned up atomically on every acquire
 *
 * Fallback: When Redis is unavailable, degrades to an in-process semaphore
 * that mirrors the existing ConcurrencyLimiter from jina-client.ts.
 *
 * @module shared/jina/distributed-concurrency-limiter
 */

import { randomUUID, createHash } from 'crypto';
import { getRedisClient, isRedisConnected } from '../cache/redis';
import logger from '../logger';
import type { ConcurrencyLimiterStats } from '../embeddings/jina-client';

// ============================================================================
// Lua Scripts
// ============================================================================

/**
 * Lua script: Acquire a semaphore slot.
 *
 * Uses Redis server TIME to avoid clock-skew issues between processes.
 * Atomically removes expired slots, checks capacity, and adds a new slot.
 *
 * KEYS[1] = jina:sem:{hash}
 * ARGV[1] = max_concurrent (2)
 * ARGV[2] = slot_id (uuid)
 * ARGV[3] = slot_ttl_ms (30000)
 * Returns: {acquired (0/1), current_count}
 */
const ACQUIRE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local key = KEYS[1]
local max_concurrent = tonumber(ARGV[1])
local slot_id = ARGV[2]
local slot_ttl_ms = tonumber(ARGV[3])

-- Remove expired slots (crashed processes)
redis.call('ZREMRANGEBYSCORE', key, 0, now)

-- Count active slots
local count = redis.call('ZCARD', key)

if count >= max_concurrent then
  return {0, count}
end

-- Add slot with expiration time as score
local expires_at = now + slot_ttl_ms
redis.call('ZADD', key, expires_at, slot_id)

return {1, count + 1}
`;

/**
 * Lua script: Release a semaphore slot.
 *
 * KEYS[1] = jina:sem:{hash}
 * ARGV[1] = slot_id
 * Returns: removed count (0 or 1)
 */
const RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

/**
 * Lua script: Extend (heartbeat) a semaphore slot.
 *
 * Refreshes the slot expiration so long-running requests are not
 * mistakenly reaped by another process's acquire cleanup.
 *
 * KEYS[1] = jina:sem:{hash}
 * ARGV[1] = slot_id
 * ARGV[2] = slot_ttl_ms
 * Returns: 1 if extended, 0 if slot not found
 */
const EXTEND_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local key = KEYS[1]
local slot_id = ARGV[1]
local slot_ttl_ms = tonumber(ARGV[2])

local score = redis.call('ZSCORE', key, slot_id)
if not score then
  return 0
end

local new_expires_at = now + slot_ttl_ms
redis.call('ZADD', key, new_expires_at, slot_id)
return 1
`;

// ============================================================================
// Constants
// ============================================================================

/** Default maximum concurrent requests (Jina API limit) */
const DEFAULT_MAX_CONCURRENT = 2;

/** Default slot time-to-live in ms (30 seconds) */
const DEFAULT_SLOT_TTL_MS = 30_000;

/** Default heartbeat interval in ms (10 seconds) */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

/** Maximum total wait time before fail-open (120 seconds) */
const MAX_WAIT_MS = 120_000;

/** Minimum retry delay with jitter (ms) */
const RETRY_DELAY_MIN_MS = 200;

/** Maximum retry delay with jitter (ms) */
const RETRY_DELAY_MAX_MS = 500;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for DistributedConcurrencyLimiter
 */
export interface DistributedConcurrencyLimiterOptions {
  /** Maximum concurrent requests allowed (default: 2) */
  maxConcurrent?: number;
  /** Slot time-to-live in ms, after which it is considered expired (default: 30000) */
  slotTtlMs?: number;
  /** Heartbeat interval in ms for extending the slot TTL (default: 10000) */
  heartbeatIntervalMs?: number;
  /** Environment variable name holding the Jina API key (default: 'JINA_API_KEY') */
  apiKeyEnvVar?: string;
}

// ============================================================================
// Helper
// ============================================================================

/**
 * Compute the first 8 hex chars of the SHA-256 hash of a string.
 * Used to namespace the Redis key per API key without leaking the key itself.
 */
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 8);
}

/**
 * Return a random integer between min (inclusive) and max (inclusive).
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// DistributedConcurrencyLimiter
// ============================================================================

/**
 * Distributed concurrency limiter that enforces a global concurrent-request
 * cap across all processes sharing the same Redis instance.
 *
 * Implements the same public interface as the in-process `ConcurrencyLimiter`
 * from `jina-client.ts` so it can be used as a drop-in replacement.
 *
 * @example
 * ```typescript
 * const limiter = new DistributedConcurrencyLimiter({ maxConcurrent: 2 });
 *
 * await limiter.acquire();
 * try {
 *   // ... Jina API call ...
 * } finally {
 *   limiter.release();
 * }
 * ```
 */
export class DistributedConcurrencyLimiter {
  // -- Configuration --
  private readonly maxConcurrent: number;
  private readonly slotTtlMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly redisKey: string;

  // -- Active slot state --
  private currentSlotId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // -- Fallback in-process state (used when Redis is unavailable) --
  private running = 0;
  private queue: Array<{ resolve: () => void; enqueuedAt: number }> = [];

  // -- Metrics --
  private _totalAcquired = 0;
  private _totalWaitTimeMs = 0;
  private _waitedCount = 0;

  constructor(options: DistributedConcurrencyLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.slotTtlMs = options.slotTtlMs ?? DEFAULT_SLOT_TTL_MS;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

    const envVar = options.apiKeyEnvVar ?? 'JINA_API_KEY';
    const apiKey = process.env[envVar] ?? 'no-key';
    this.redisKey = `jina:sem:${hashApiKey(apiKey)}`;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Acquire a concurrency slot.
   *
   * Tries to claim a slot in the Redis ZSET semaphore. If the semaphore is
   * full, polls with random jitter (200-500 ms). After 120 s of waiting the
   * method fails open (logs a warning and falls back to in-process limiting).
   *
   * When Redis is unavailable the method immediately falls back to the
   * in-process semaphore so callers never hang indefinitely.
   */
  async acquire(): Promise<void> {
    if (!isRedisConnected()) {
      logger.debug(
        { redisKey: this.redisKey },
        '[DistributedConcurrencyLimiter] Redis unavailable, using in-process fallback'
      );
      return this.fallbackAcquire();
    }

    const slotId = randomUUID();
    const startTime = Date.now();

    while (true) {
      try {
        const redis = getRedisClient();
        const result = (await redis.eval(
          ACQUIRE_SCRIPT,
          1,
          this.redisKey,
          String(this.maxConcurrent),
          slotId,
          String(this.slotTtlMs)
        )) as [number, number];

        const [acquired, currentCount] = result;

        if (acquired === 1) {
          this.currentSlotId = slotId;
          this.startHeartbeat(slotId);

          const waitTime = Date.now() - startTime;
          this._totalAcquired++;
          if (waitTime > 0) {
            this._totalWaitTimeMs += waitTime;
            this._waitedCount++;
          }

          logger.debug(
            {
              slotId,
              currentCount,
              waitTimeMs: waitTime,
              redisKey: this.redisKey,
            },
            '[DistributedConcurrencyLimiter] Slot acquired'
          );
          return;
        }

        // Semaphore full -- check total wait budget
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_WAIT_MS) {
          logger.warn(
            {
              elapsedMs: elapsed,
              currentCount,
              redisKey: this.redisKey,
            },
            '[DistributedConcurrencyLimiter] Max wait exceeded, failing open to in-process fallback'
          );
          return this.fallbackAcquire();
        }

        // Wait with random jitter then retry
        const delay = randomBetween(RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS);
        await new Promise<void>(resolve => setTimeout(resolve, delay));
      } catch (err) {
        // Redis error during acquire -- fall back gracefully
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.warn(
          { error: errorMessage, redisKey: this.redisKey },
          '[DistributedConcurrencyLimiter] Redis error during acquire, using in-process fallback'
        );
        return this.fallbackAcquire();
      }
    }
  }

  /**
   * Release the currently held concurrency slot.
   *
   * This method is synchronous (returns `void`) to match the existing
   * `ConcurrencyLimiter` interface. The Redis ZREM call is fire-and-forget.
   */
  release(): void {
    this.stopHeartbeat();

    if (this.currentSlotId && isRedisConnected()) {
      const slotId = this.currentSlotId;
      this.currentSlotId = null;

      // Fire-and-forget: release must be sync per interface contract
      try {
        const redis = getRedisClient();
        // Fire-and-forget with error suppression
        void Promise.resolve(redis.eval(RELEASE_SCRIPT, 1, this.redisKey, slotId)).catch(
          (err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.warn(
              { error: errorMessage, slotId, redisKey: this.redisKey },
              '[DistributedConcurrencyLimiter] Failed to release slot in Redis (fire-and-forget)'
            );
          }
        );
      } catch {
        // Release is fire-and-forget — slot will expire via TTL
      }

      logger.debug(
        { slotId, redisKey: this.redisKey },
        '[DistributedConcurrencyLimiter] Slot released'
      );
      return;
    }

    // No Redis slot held -- use fallback release
    this.currentSlotId = null;
    this.fallbackRelease();
  }

  /**
   * Returns current concurrency limiter statistics.
   *
   * Metrics are local to this process instance, not cluster-wide.
   */
  getStats(): ConcurrencyLimiterStats {
    return {
      currentRunning: this.running,
      queueLength: this.queue.length,
      totalAcquired: this._totalAcquired,
      totalWaitTimeMs: this._totalWaitTimeMs,
      avgWaitTimeMs: this._waitedCount > 0 ? this._totalWaitTimeMs / this._waitedCount : 0,
    };
  }

  /**
   * Resets all statistics counters to zero.
   * Does NOT affect current running requests or queue.
   */
  reset(): void {
    this._totalAcquired = 0;
    this._totalWaitTimeMs = 0;
    this._waitedCount = 0;
  }

  // --------------------------------------------------------------------------
  // Heartbeat
  // --------------------------------------------------------------------------

  /**
   * Start a periodic heartbeat that extends the slot TTL in Redis.
   * Prevents the slot from being reaped while a long-running request
   * is still in progress.
   */
  private startHeartbeat(slotId: string): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!isRedisConnected()) {
        return;
      }

      try {
        const redis = getRedisClient();
        // Fire-and-forget heartbeat extend with error suppression
        void Promise.resolve(
          redis.eval(EXTEND_SCRIPT, 1, this.redisKey, slotId, String(this.slotTtlMs))
        )
          .then(result => {
            if (result === 0) {
              logger.warn(
                { slotId, redisKey: this.redisKey },
                '[DistributedConcurrencyLimiter] Heartbeat: slot not found (expired or removed)'
              );
            }
          })
          .catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.warn(
              { error: errorMessage, slotId, redisKey: this.redisKey },
              '[DistributedConcurrencyLimiter] Heartbeat extend failed'
            );
          });
      } catch {
        // Heartbeat is non-critical — silently skip on unexpected errors
      }
    }, this.heartbeatIntervalMs);

    // Ensure the timer does not keep the process alive
    if (
      this.heartbeatTimer &&
      typeof this.heartbeatTimer === 'object' &&
      'unref' in this.heartbeatTimer
    ) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stop the heartbeat timer to prevent resource leaks.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // In-process fallback (mirrors ConcurrencyLimiter from jina-client.ts)
  // --------------------------------------------------------------------------

  /**
   * Acquire a slot using the in-process semaphore.
   * Used when Redis is unavailable or the distributed wait budget is exceeded.
   */
  private async fallbackAcquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      this._totalAcquired++;
      return;
    }

    const enqueuedAt = Date.now();
    return new Promise<void>(resolve => {
      this.queue.push({
        resolve: () => {
          const waitTime = Date.now() - enqueuedAt;
          this._totalWaitTimeMs += waitTime;
          this._waitedCount++;

          this.running++;
          this._totalAcquired++;
          resolve();
        },
        enqueuedAt,
      });
    });
  }

  /**
   * Release a slot using the in-process semaphore.
   * Immediately grants the slot to the next waiter in the queue.
   */
  private fallbackRelease(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.resolve();
    }
  }
}
