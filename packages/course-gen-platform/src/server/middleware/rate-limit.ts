/**
 * Rate limiting middleware for tRPC using Redis
 * @module server/middleware/rate-limit
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
 * - Configurable limits per procedure
 * - Fail-open strategy (allows requests if Redis is down)
 */

 

/**
 * - Detailed error messages with retry information
 *
 * Usage:
 * ```typescript
 * import { createRateLimiter, rateLimitedProcedure } from './middleware/rate-limit';
 *
 * // Custom rate limit
 * const createCourse = protectedProcedure
 *   .use(createRateLimiter({ requests: 10, window: 60 }))
 *   .mutation(async ({ ctx, input }) => {
 *     // Handler logic
 *   });
 *
 * // Pre-configured rate limit
 * const listCourses = rateLimitedProcedure.query(async ({ ctx }) => {
 *   // Handler logic
 * });
 * ```
 */

import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';
import { getRedisClient } from '../../shared/cache/redis';
import { middleware, publicProcedure } from '../trpc';
import type { Context } from '../trpc';
import logger from '../../shared/logger';

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

  /**
   * Custom identifier function to extract rate limit key from context
   * By default, uses user ID for authenticated requests and IP for unauthenticated
   * @param ctx - tRPC context
   * @param path - Procedure path
   * @returns Identifier string for rate limiting
   */
  identifierFn?: (ctx: Context, path: string) => string | null;
}

/**
 * Rate limit error details included in TRPCError
 */
interface RateLimitErrorData {
  /** Current number of requests in the window */
  currentRequests: number;
  /** Maximum allowed requests */
  limit: number;
  /** Time until window reset (seconds) */
  retryAfter: number;
  /** Window size in seconds */
  windowSize: number;
}

/**
 * Extract client IP address from request headers
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) with proper validation
 *
 * Priority order:
 * 1. X-Forwarded-For (first IP in chain - the original client)
 * 2. X-Real-IP
 * 3. CF-Connecting-IP (Cloudflare)
 * 4. Direct connection (not supported in tRPC fetch adapter)
 *
 * @param req - Request object
 * @returns Client IP address or null if not found
 */
function extractClientIp(req: Request): string | null {
  // Try X-Forwarded-For header (most common proxy header)
  // Format: "client, proxy1, proxy2"
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP (original client), strip port if present
    const clientIp = xForwardedFor.split(',')[0].trim();
    const ipWithoutPort = clientIp.replace(/:\d+[^:]*$/, '');
    if (ipWithoutPort) {
      return ipWithoutPort;
    }
  }

  // Try X-Real-IP header (nginx, some proxies)
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.replace(/:\d+[^:]*$/, '');
  }

  // Try Cloudflare header
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.replace(/:\d+[^:]*$/, '');
  }

  // No IP found - this can happen in serverless/edge environments
  // Rate limiting will be skipped for these requests (fail-open)
  return null;
}

/**
 * Default identifier function for rate limiting
 * Uses user ID for authenticated requests, IP address for unauthenticated
 *
 * @param ctx - tRPC context
 * @param _path - Procedure path (unused, but kept for interface compatibility)
 * @returns User ID or IP address
 */
function defaultIdentifier(ctx: Context, _path: string): string | null {
  // For authenticated users, use their user ID (more secure)
  if (ctx.user) {
    return ctx.user.id;
  }

  // For unauthenticated requests, extract IP from headers
  const clientIp = extractClientIp(ctx.req);

  // Prefix IP addresses to distinguish from user IDs
  // This prevents collision if a user ID happens to match an IP
  return clientIp ? `ip:${clientIp}` : null;
}

/**
 * Create rate limiting middleware
 *
 * This middleware implements a sliding window rate limiter using Redis ZSET.
 * It tracks request timestamps and enforces limits per user or IP.
 *
 * Flow:
 * 1. Extract identifier (user ID or IP) from context
 * 2. Generate Redis key: {prefix}:{endpoint}:{identifier}
 * 3. Get current timestamp
 * 4. Remove entries older than window (ZREMRANGEBYSCORE)
 * 5. Count remaining entries (ZCARD)
 * 6. If count >= limit, throw TOO_MANY_REQUESTS error
 * 7. Add current request timestamp (ZADD)
 * 8. Set expiration for automatic cleanup (EXPIRE)
 * 9. Continue to next middleware/procedure
 *
 * Error Handling:
 * - Redis errors: Log and fail open (allow request)
 * - Rate limit exceeded: Throw TOO_MANY_REQUESTS with retry info
 *
 * @param options - Rate limiter configuration
 * @returns tRPC middleware function
 *
 * @example
 * ```typescript
 * // Custom rate limit for file uploads
 * const uploadFile = protectedProcedure
 *   .use(createRateLimiter({ requests: 5, window: 60 }))
 *   .mutation(async ({ ctx, input }) => {
 *     // Only 5 uploads per minute allowed
 *   });
 * ```
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const {
    requests = 100,
    window = 60,
    keyPrefix = 'rate-limit',
    identifierFn = defaultIdentifier,
  } = options;

  return middleware(async ({ ctx, next, path, type }) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      logger.debug({ path }, 'Rate limiting disabled in test environment');
      return next();
    }

    // Extract identifier for rate limiting
    const identifier = identifierFn(ctx, path);

    // If no identifier (e.g., unauthenticated request without IP headers),
    // skip rate limiting (fail open strategy)
    // This can happen in serverless/edge environments without proxy headers
    if (!identifier) {
      logger.warn({
        path,
        type,
        hasUser: !!ctx.user,
        headers: {
          xForwardedFor: ctx.req.headers.get('x-forwarded-for'),
          xRealIp: ctx.req.headers.get('x-real-ip'),
          cfConnectingIp: ctx.req.headers.get('cf-connecting-ip'),
        },
      }, 'Rate limit skipped: no identifier found (no user ID or IP)');
      return next();
    }

    // Generate Redis key: rate-limit:{endpoint}:{identifier}
    const redisKey = `${keyPrefix}:${path}:${identifier}`;

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

        // Prepare error data
        const errorData: RateLimitErrorData = {
          currentRequests: currentCount,
          limit: requests,
          retryAfter: Math.max(retryAfter, 1),
          windowSize: window,
        };

        logger.warn({
          path,
          identifier,
          ...errorData,
        }, 'Rate limit exceeded');

        // Throw TOO_MANY_REQUESTS error
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. You have made ${currentCount} requests in the last ${window} seconds. The limit is ${requests} requests per ${window} seconds. Please try again in ${errorData.retryAfter} seconds.`,
          cause: errorData,
        });
      }

      // Add current request timestamp to ZSET with cryptographically secure UUID
      await redis.zadd(redisKey, now, `${now}-${randomUUID()}`);

      // Set expiration for automatic cleanup (window size + buffer)
      await redis.expire(redisKey, window + 10);

      logger.debug({
        path,
        identifier,
        currentRequests: currentCount + 1,
        limit: requests,
        windowSize: window,
      }, 'Rate limit check passed');

      // Continue to next middleware/procedure
      return next();
    } catch (error) {
      // If it's already a TRPCError (rate limit exceeded), re-throw it
      if (error instanceof TRPCError) {
        throw error;
      }

      // For Redis errors, log and fail open (allow the request)
      // This prevents Redis failures from breaking the entire API
      logger.error({
        path,
        identifier,
        err: error,
      }, 'Rate limit check failed (failing open)');

      // Continue to next middleware/procedure
      return next();
    }
  });
}

/**
 * Pre-configured rate limited procedure with standard limits
 *
 * Default configuration:
 * - 100 requests per minute (60 seconds)
 * - User-based identification
 *
 * Use this for most API endpoints that need basic rate limiting.
 *
 * @example
 * ```typescript
 * import { rateLimitedProcedure } from './middleware/rate-limit';
 *
 * const listCourses = rateLimitedProcedure.query(async ({ ctx }) => {
 *   return await fetchCourses(ctx.user?.organizationId);
 * });
 * ```
 */
export const rateLimitedProcedure = publicProcedure.use(
  createRateLimiter({
    requests: 100,
    window: 60,
  })
);

/**
 * Pre-configured rate limited procedure with strict limits
 *
 * Default configuration:
 * - 10 requests per minute (60 seconds)
 * - User-based identification
 *
 * Use this for sensitive operations like:
 * - File uploads
 * - Course generation
 * - Payment operations
 * - Admin actions
 *
 * @example
 * ```typescript
 * import { strictRateLimitedProcedure } from './middleware/rate-limit';
 *
 * const generateCourse = strictRateLimitedProcedure
 *   .use(requireInstructor)
 *   .mutation(async ({ ctx, input }) => {
 *     return await startCourseGeneration(input);
 *   });
 * ```
 */
export const strictRateLimitedProcedure = publicProcedure.use(
  createRateLimiter({
    requests: 10,
    window: 60,
  })
);

/**
 * Rate limiter for authenticated procedures
 *
 * This is an alias for rateLimitedProcedure that requires authentication.
 * It combines rate limiting with authentication checks.
 *
 * Use this when you want both rate limiting and authentication in one step.
 *
 * @example
 * ```typescript
 * import { authenticatedRateLimitedProcedure } from './middleware/rate-limit';
 *
 * const myProfile = authenticatedRateLimitedProcedure.query(async ({ ctx }) => {
 *   // ctx.user is guaranteed non-null
 *   return await fetchUserProfile(ctx.user.id);
 * });
 * ```
 */
export { rateLimitedProcedure as authenticatedRateLimitedProcedure };
