/**
 * Distributed Rate Limiter for Jina API
 * @module shared/jina/distributed-rate-limiter
 *
 * Enforces Jina API's 100 RPM limit across ALL processes, worker threads, and servers
 * using a Redis ZSET sliding window algorithm with atomic Lua script operations.
 *
 * Features:
 * - Redis ZSET sliding window for distributed RPM enforcement
 * - Atomic check-and-increment via Lua script (no race conditions)
 * - Server-side timestamps (redis.call('TIME')) to avoid clock skew
 * - Graceful fallback to in-process rate limiting when Redis is unavailable
 * - Fail-open after 60s max wait to prevent indefinite blocking
 *
 * @see generation-lock.ts for the redis.eval() pattern reference
 */

import { randomUUID, createHash } from 'crypto';
import { getRedisClient, isRedisConnected } from '../cache/redis';
import logger from '../logger';

// ============================================================================
// Lua Script
// ============================================================================

/**
 * Atomic Lua script for sliding window rate limiting using ZSET.
 *
 * Uses Redis server time to avoid clock skew between distributed processes.
 * Returns: [allowed (0/1), current_count, wait_ms]
 *
 * KEYS[1] = jina:rpm:{hash}
 * ARGV[1] = window_ms (60000)
 * ARGV[2] = max_requests (100)
 * ARGV[3] = member_id (uuid)
 */
const LUA_SLIDING_WINDOW_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local max_requests = tonumber(ARGV[2])
local member_id = ARGV[3]
local window_start = now - window_ms

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

local count = redis.call('ZCARD', key)

if count >= max_requests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local wait_ms = 0
  if #oldest >= 2 then
    wait_ms = tonumber(oldest[2]) + window_ms - now
    if wait_ms < 0 then wait_ms = 0 end
  end
  return {0, count, wait_ms}
end

redis.call('ZADD', key, now, member_id)
redis.call('PEXPIRE', key, window_ms + 10000)

return {1, count + 1, 0}
`;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for DistributedRateLimiter
 */
export interface DistributedRateLimiterOptions {
  /** Maximum requests allowed within the sliding window (default: 100) */
  maxRequestsPerWindow?: number;
  /** Sliding window duration in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Environment variable name for the Jina API key (default: 'JINA_API_KEY') */
  apiKeyEnvVar?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60000;
const DEFAULT_API_KEY_ENV = 'JINA_API_KEY';

/** Maximum total time to wait for a rate limit slot before fail-open (ms) */
const MAX_TOTAL_WAIT_MS = 60000;

/** Minimum wait time between retry attempts when rate limited (ms) */
const MIN_RETRY_WAIT_MS = 500;

/** Minimum interval for in-process fallback (ms) — same as current RateLimiter */
const FALLBACK_MIN_INTERVAL_MS = 600;

// ============================================================================
// DistributedRateLimiter
// ============================================================================

/**
 * Distributed rate limiter that enforces Jina API's RPM limit across all processes.
 *
 * Uses a Redis ZSET sliding window with atomic Lua script operations.
 * Falls back to in-process rate limiting when Redis is unavailable.
 *
 * @example
 * ```typescript
 * const limiter = new DistributedRateLimiter({ maxRequestsPerWindow: 100 });
 * await limiter.waitForSlot();
 * // Safe to make Jina API request
 * ```
 */
export class DistributedRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly redisKey: string;

  // In-process fallback state (mirrors current RateLimiter behavior)
  private lastFallbackRequestTime = 0;

  constructor(options: DistributedRateLimiterOptions = {}) {
    this.maxRequests = options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

    const apiKeyEnv = options.apiKeyEnvVar ?? DEFAULT_API_KEY_ENV;
    const apiKey = process.env[apiKeyEnv] || 'no-key';
    const keyHash = createHash('sha256').update(apiKey).digest('hex').substring(0, 8);
    this.redisKey = `jina:rpm:${keyHash}`;
  }

  /**
   * Waits until a rate limit slot is available.
   *
   * Behavior:
   * 1. If Redis is connected, uses distributed ZSET sliding window
   * 2. If Redis is unavailable, falls back to in-process interval-based limiting
   * 3. If rate limited, waits and retries until a slot opens
   * 4. After 60s total wait, fails open (logs warning, returns) to prevent deadlock
   * 5. On any Redis error, falls back to in-process limiting
   */
  async waitForSlot(): Promise<void> {
    // Check Redis availability
    if (!isRedisConnected()) {
      logger.debug(
        { redisKey: this.redisKey },
        '[DistributedRateLimiter] Redis unavailable, using in-process fallback'
      );
      await this.inProcessFallback();
      return;
    }

    const startTime = Date.now();

    while (true) {
      // Check max total wait time — fail-open
      const elapsed = Date.now() - startTime;
      if (elapsed >= MAX_TOTAL_WAIT_MS) {
        logger.warn(
          {
            redisKey: this.redisKey,
            elapsedMs: elapsed,
            maxWaitMs: MAX_TOTAL_WAIT_MS,
          },
          '[DistributedRateLimiter] Max wait time exceeded, failing open'
        );
        return;
      }

      try {
        const redis = getRedisClient();
        const memberId = `${Date.now()}-${randomUUID()}`;

        const result = (await redis.eval(
          LUA_SLIDING_WINDOW_SCRIPT,
          1,
          this.redisKey,
          this.windowMs,
          this.maxRequests,
          memberId
        )) as number[];

        const allowed = result[0];
        const currentCount = result[1];
        const waitMs = result[2];

        if (allowed === 1) {
          logger.debug(
            {
              redisKey: this.redisKey,
              currentCount,
              maxRequests: this.maxRequests,
            },
            '[DistributedRateLimiter] Slot acquired'
          );
          return;
        }

        // Rate limited — wait and retry
        const actualWait = Math.max(waitMs, MIN_RETRY_WAIT_MS);
        logger.debug(
          {
            redisKey: this.redisKey,
            currentCount,
            waitMs: actualWait,
            maxRequests: this.maxRequests,
          },
          '[DistributedRateLimiter] Rate limited, waiting for slot'
        );

        await new Promise(resolve => setTimeout(resolve, actualWait));
      } catch (error) {
        // Redis error — fall back to in-process limiting
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(
          {
            redisKey: this.redisKey,
            error: errorMessage,
          },
          '[DistributedRateLimiter] Redis error, using in-process fallback'
        );
        await this.inProcessFallback();
        return;
      }
    }
  }

  /**
   * In-process fallback rate limiting.
   * Uses the same interval-based approach as the current RateLimiter class.
   */
  private async inProcessFallback(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastFallbackRequestTime;

    if (timeSinceLastRequest < FALLBACK_MIN_INTERVAL_MS) {
      const waitTime = FALLBACK_MIN_INTERVAL_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastFallbackRequestTime = Date.now();
  }
}
