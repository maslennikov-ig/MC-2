/**
 * Example usage of rate limiting middleware
 * @module examples/rate-limit-usage
 *
 * This file demonstrates various ways to use the rate limiting middleware
 * in tRPC procedures.
 */

import { router } from '../src/server/trpc';
import { protectedProcedure } from '../src/server/middleware/auth';
import {
  createRateLimiter,
  rateLimitedProcedure,
  strictRateLimitedProcedure,
} from '../src/server/middleware/rate-limit';
import { z } from 'zod';

/**
 * Example 1: Using pre-configured rate limited procedure
 * - Default: 100 requests per minute
 * - Works for both authenticated and unauthenticated users
 */
export const exampleRouter1 = router({
  // Public endpoint with rate limiting
  publicList: rateLimitedProcedure.query(async ({ ctx }) => {
    return {
      message: 'This endpoint is rate limited to 100 requests per minute',
      user: ctx.user?.id || 'anonymous',
    };
  }),
});

/**
 * Example 2: Using strict rate limits for sensitive operations
 * - Default: 10 requests per minute
 * - Ideal for file uploads, course generation, etc.
 */
export const exampleRouter2 = router({
  // File upload with strict rate limiting
  uploadFile: strictRateLimitedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileSize: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return {
        message: 'File uploaded successfully',
        fileName: input.fileName,
        user: ctx.user?.id || 'anonymous',
      };
    }),
});

/**
 * Example 3: Custom rate limits per procedure
 * - Configure specific limits for each endpoint
 */
export const exampleRouter3 = router({
  // Very strict limit for course generation: 5 per hour
  generateCourse: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 3600 }))
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return {
        message: 'Course generation started',
        courseTitle: input.title,
        userId: ctx.user.id,
      };
    }),

  // Moderate limit for API-intensive operations: 30 per minute
  searchContent: protectedProcedure
    .use(createRateLimiter({ requests: 30, window: 60 }))
    .input(
      z.object({
        query: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return {
        message: 'Search completed',
        query: input.query,
        results: [],
      };
    }),
});

/**
 * Example 4: Combining rate limiting with role-based authorization
 * - Rate limit applies AFTER authentication check
 */
import { requireInstructor } from '../src/server/middleware/authorize';

export const exampleRouter4 = router({
  // Instructor-only endpoint with rate limiting
  createCourse: protectedProcedure
    .use(requireInstructor)
    .use(createRateLimiter({ requests: 20, window: 60 }))
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return {
        message: 'Course created successfully',
        courseTitle: input.title,
        instructorId: ctx.user.id,
      };
    }),
});

/**
 * Example 5: Custom identifier function
 * - Use custom logic to identify users for rate limiting
 */
export const exampleRouter5 = router({
  // Rate limit by organization ID instead of user ID
  organizationStats: protectedProcedure
    .use(
      createRateLimiter({
        requests: 50,
        window: 60,
        keyPrefix: 'org-rate-limit',
        identifierFn: (ctx, _path) => {
          // Rate limit by organization, not individual user
          return ctx.user?.organizationId || null;
        },
      })
    )
    .query(async ({ ctx }) => {
      return {
        message: 'Organization stats retrieved',
        organizationId: ctx.user.organizationId,
      };
    }),
});

/**
 * Example 6: Different limits for different procedures in same router
 */
export const exampleRouter6 = router({
  // Light endpoint: High limit
  listCourses: rateLimitedProcedure.query(async ({ ctx }) => {
    return {
      courses: [],
      userId: ctx.user?.id,
    };
  }),

  // Heavy endpoint: Strict limit
  generateBulkContent: strictRateLimitedProcedure
    .input(
      z.object({
        courseIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return {
        message: 'Bulk generation started',
        count: input.courseIds.length,
      };
    }),

  // Custom endpoint: Very specific limit
  exportData: protectedProcedure
    .use(createRateLimiter({ requests: 3, window: 3600 })) // 3 per hour
    .mutation(async ({ ctx }) => {
      return {
        message: 'Data export started',
        userId: ctx.user.id,
      };
    }),
});

/**
 * Example 7: Error handling for rate limits
 *
 * When rate limit is exceeded, the middleware throws a TRPCError with:
 * - code: 'TOO_MANY_REQUESTS'
 * - message: Detailed explanation with retry information
 * - cause: { currentRequests, limit, retryAfter, windowSize }
 *
 * Client-side error handling:
 */
// In your tRPC client:
// try {
//   await client.exampleProcedure.mutate({ ... });
// } catch (error) {
//   if (error.data?.code === 'TOO_MANY_REQUESTS') {
//     const retryAfter = error.cause?.retryAfter;
//     console.log(`Rate limited. Try again in ${retryAfter} seconds.`);
//   }
// }
