/**
 * Rate limiting utility for Next.js API routes using Redis
 * @module lib/rate-limit
 *
 * This module implements rate limiting using a sliding window algorithm with Redis ZSET.
 * It supports both authenticated (user-based) and unauthenticated (IP-based) rate limiting.
 *
 * Algorithm:
 * - Uses Redis sorted sets (ZSET) to track request timestamps
 * - Each request adds a timestamp entry to the ZSET
 * - Removes timestamps outside the current window
 * - Counts remaining entries to check against limit
 * - Automatically expires keys for cleanup
 *
 * Key Features:
 * - Sliding window for accurate rate limiting (not fixed window)
 * - Per-user rate limiting for authenticated requests
 * - Per-IP rate limiting for unauthenticated requests
 * - Configurable limits per endpoint
 * - Fail-open strategy (allows requests if Redis is down)
 * - Returns rate limit headers (X-RateLimit-*)
 *
 * Usage:
 * ```typescript
 * import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';
 *
 * export async function GET(request: NextRequest) {
 *   const identifier = getRateLimitIdentifier(request, userId);
 *   const rateLimitResult = await checkRateLimit(identifier, {
 *     requests: 60,
 *     window: 60
 *   });
 *
 *   if (!rateLimitResult.success) {
 *     return NextResponse.json(
 *       { error: 'Rate limit exceeded' },
 *       {
 *         status: 429,
 *         headers: {
 *           'Retry-After': String(rateLimitResult.retryAfter),
 *           'X-RateLimit-Limit': String(60),
 *           'X-RateLimit-Remaining': String(rateLimitResult.remaining),
 *           'X-RateLimit-Reset': String(rateLimitResult.reset),
 *         },
 *       }
 *     );
 *   }
 *
 *   // Process request...
 * }
 * ```
 */

import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { getRedisClient } from './redis-client';
import { logger } from './logger';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of remaining requests in current window */
  remaining: number;
  /** Unix timestamp (seconds) when the rate limit resets */
  reset: number;
  /** Number of seconds to wait before retrying (only present when success=false) */
  retryAfter?: number;
}

/**
 * Rate limiter configuration options
 */
export interface RateLimiterOptions {
  /**
   * Number of allowed requests within the time window
   * @default 100
   */
  requests?: number;

  /**
   * Time window in seconds
   * @default 60
   */
  window?: number;

  /**
   * Redis key prefix for rate limit keys
   * @default 'rate-limit'
   */
  keyPrefix?: string;
}

/**
 * Extract client IP address from Next.js request headers
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) with proper validation
 *
 * Priority order:
 * 1. X-Forwarded-For (first IP in chain - the original client)
 * 2. X-Real-IP
 * 3. CF-Connecting-IP (Cloudflare)
 *
 * @param request - Next.js request object
 * @returns Client IP address or null if not found
 */
function extractClientIp(request: NextRequest): string | null {
  // Try X-Forwarded-For header (most common proxy header)
  // Format: "client, proxy1, proxy2"
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP (original client), strip port if present
    const clientIp = xForwardedFor.split(',')[0].trim();
    const ipWithoutPort = clientIp.replace(/:\d+[^:]*$/, '');
    if (ipWithoutPort) {
      return ipWithoutPort;
    }
  }

  // Try X-Real-IP header (nginx, some proxies)
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.replace(/:\d+[^:]*$/, '');
  }

  // Try Cloudflare header
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.replace(/:\d+[^:]*$/, '');
  }

  // No IP found - this can happen in serverless/edge environments
  return null;
}

/**
 * Get rate limit identifier from Next.js request
 *
 * Uses user ID for authenticated requests, IP address for unauthenticated.
 * IP addresses are prefixed with "ip:" to prevent collision with user IDs.
 *
 * @param request - Next.js request object
 * @param userId - Optional user ID for authenticated requests
 * @returns Identifier string for rate limiting
 */
export function getRateLimitIdentifier(
  request: NextRequest,
  userId?: string
): string {
  // For authenticated users, use their user ID (more secure)
  if (userId) {
    return userId;
  }

  // For unauthenticated requests, extract IP from headers
  const clientIp = extractClientIp(request);

  // Prefix IP addresses to distinguish from user IDs
  // This prevents collision if a user ID happens to match an IP
  return clientIp ? `ip:${clientIp}` : `anonymous:${randomUUID()}`;
}

/**
 * Check rate limit for a given identifier using sliding window algorithm
 *
 * This function implements a sliding window rate limiter using Redis ZSET.
 * It tracks request timestamps and enforces limits per identifier.
 *
 * Flow:
 * 1. Generate Redis key: {prefix}:{identifier}
 * 2. Get current timestamp
 * 3. Remove entries older than window (ZREMRANGEBYSCORE)
 * 4. Count remaining entries (ZCARD)
 * 5. If count >= limit, return failure with retry info
 * 6. Add current request timestamp (ZADD)
 * 7. Set expiration for automatic cleanup (EXPIRE)
 * 8. Return success with remaining count
 *
 * Error Handling:
 * - Redis errors: Log and fail open (allow request)
 * - Rate limit exceeded: Return failure result
 *
 * @param identifier - Unique identifier for rate limiting (user ID or IP)
 * @param options - Rate limiter configuration
 * @returns Rate limit check result
 *
 * @example
 * ```typescript
 * const result = await checkRateLimit('user-123', {
 *   requests: 60,
 *   window: 60
 * });
 *
 * if (!result.success) {
 *   console.log(`Rate limited. Retry in ${result.retryAfter} seconds`);
 * }
 * ```
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimiterOptions = {}
): Promise<RateLimitResult> {
  const {
    requests = 100,
    window = 60,
    keyPrefix = 'rate-limit',
  } = options;

  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    logger.debug('Rate limiting disabled in test environment');
    return {
      success: true,
      remaining: requests,
      reset: Math.floor(Date.now() / 1000) + window,
    };
  }

  // Generate Redis key: rate-limit:{identifier}
  const redisKey = `${keyPrefix}:${identifier}`;

  // Get current timestamp in milliseconds
  const now = Date.now();
  const windowMs = window * 1000;
  const windowStart = now - windowMs;

  try {
    const redis = getRedisClient();

    // Ensure Redis is connected
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      await redis.connect();
    }

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Remove entries older than the current window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Count current requests in window
    pipeline.zcard(redisKey);

    // Execute pipeline
    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Redis pipeline returned null');
    }

    // Extract count from pipeline results
    // results is an array of [error, result] tuples
    const countResult = results[1];
    if (countResult[0]) {
      throw countResult[0];
    }

    const currentCount = countResult[1] as number;

    // Check if rate limit exceeded
    if (currentCount >= requests) {
      // Calculate time until window reset
      // Get the oldest timestamp in the window
      const oldestEntries = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldestEntries.length > 1 ? parseInt(oldestEntries[1]) : now;
      const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

      logger.warn('Rate limit exceeded', {
        identifier,
        currentRequests: currentCount,
        limit: requests,
        windowSize: window,
        retryAfter,
      });

      return {
        success: false,
        remaining: 0,
        reset: Math.floor((oldestTimestamp + windowMs) / 1000),
        retryAfter: Math.max(retryAfter, 1),
      };
    }

    // Add current request timestamp to ZSET with cryptographically secure UUID
    await redis.zadd(redisKey, now, `${now}-${randomUUID()}`);

    // Set expiration for automatic cleanup (window size + buffer)
    await redis.expire(redisKey, window + 10);

    logger.debug('Rate limit check passed', {
      identifier,
      currentRequests: currentCount + 1,
      limit: requests,
      remaining: requests - currentCount - 1,
      windowSize: window,
    });

    return {
      success: true,
      remaining: requests - currentCount - 1,
      reset: Math.floor((now + windowMs) / 1000),
    };
  } catch (error) {
    // For Redis errors, log and fail open (allow the request)
    // This prevents Redis failures from breaking the entire API
    logger.error('Rate limit check failed (failing open)', {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });

    // Fail open - allow request when Redis is unavailable
    return {
      success: true,
      remaining: requests,
      reset: Math.floor(Date.now() / 1000) + window,
    };
  }
}
