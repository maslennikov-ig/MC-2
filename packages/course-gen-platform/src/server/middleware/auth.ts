/**
 * Authentication middleware for tRPC
 * @module server/middleware/auth
 *
 * This module provides middleware that enforces authentication requirements
 * for protected tRPC procedures. It checks if a valid user context exists
 * and throws an UNAUTHORIZED error if authentication is missing.
 *
 * Background:
 * - The `createContext()` function (T048) validates JWT tokens and returns ctx.user
 * - Context returns null for invalid/missing tokens instead of throwing errors
 * - This middleware enforces authentication by checking ctx.user and throwing if null
 * - This allows distinction between public and protected procedures
 *
 * Usage:
 * - Public procedures: Use `publicProcedure` (no middleware, user optional)
 * - Protected procedures: Use `protectedProcedure` (requires auth, user guaranteed)
 */

import { TRPCError } from '@trpc/server';
import { publicProcedure, middleware } from '../trpc';

/**
 * Authentication middleware
 *
 * Checks if user context exists (meaning JWT was valid) and throws
 * UNAUTHORIZED error if user is null. This middleware ensures that
 * procedures using it can safely assume ctx.user is non-null.
 *
 * Flow:
 * 1. Check if ctx.user exists (validated in createContext)
 * 2. If null, throw TRPCError with UNAUTHORIZED code (HTTP 401)
 * 3. If exists, pass through with type-safe non-null user context
 *
 * Error Handling:
 * - Missing/invalid JWT → ctx.user is null → throws UNAUTHORIZED
 * - Valid JWT → ctx.user populated → passes through
 *
 * Type Safety:
 * After this middleware, TypeScript knows that ctx.user is non-null,
 * providing type safety for downstream procedures and middleware.
 *
 * @throws {TRPCError} UNAUTHORIZED (401) if user context is missing
 * @returns Modified context with guaranteed non-null user
 *
 * @example
 * ```typescript
 * // In trpc.ts
 * export const protectedProcedure = publicProcedure.use(isAuthenticated);
 *
 * // In router
 * const userRouter = router({
 *   getProfile: protectedProcedure.query(({ ctx }) => {
 *     // ctx.user is guaranteed non-null here
 *     return { id: ctx.user.id, email: ctx.user.email };
 *   }),
 * });
 * ```
 */
export const isAuthenticated = middleware(async ({ ctx, next }) => {
  // Check if user context exists
  // ctx.user is null when:
  // - No Authorization header provided
  // - Invalid JWT token format
  // - JWT validation failed (expired, invalid signature, etc.)
  // - User not found in database
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please provide a valid Bearer token.',
    });
  }

  // User is authenticated - pass through with non-null user context
  // TypeScript now knows user is non-null in downstream procedures
  return next({
    ctx: {
      user: ctx.user, // Type narrowed to non-null
    },
  });
});

/**
 * Protected procedure
 *
 * A pre-configured procedure that requires authentication. Use this for
 * endpoints that need authenticated user context. The user will be
 * guaranteed to be non-null in procedures using this.
 *
 * @example
 * ```typescript
 * import { protectedProcedure } from './middleware/auth';
 *
 * const userRouter = router({
 *   getProfile: protectedProcedure.query(({ ctx }) => {
 *     // ctx.user is guaranteed non-null
 *     return { id: ctx.user.id, email: ctx.user.email };
 *   }),
 * });
 * ```
 */
export const protectedProcedure = publicProcedure.use(isAuthenticated);
