/**
 * Generation Locks Router
 * @module server/routers/locks
 *
 * Provides tRPC procedures for checking and managing generation locks.
 * Implements FR-037 (prevent concurrent generation) and FR-038 (check lock status).
 *
 * Procedures:
 * - `locks.isLocked` - Check if a course is currently locked (protected)
 * - `locks.getLock` - Get lock details for a course (protected)
 * - `locks.getAllLocks` - Get all active locks (admin only)
 * - `locks.forceRelease` - Force release a lock (admin only)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { adminProcedure } from '../procedures';
import { generationLockService } from '../../shared/locks';
import { logger } from '../../shared/logger/index.js';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for course ID input
 */
const courseIdSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

// ============================================================================
// Response Types
// ============================================================================

/**
 * Lock details response type
 * Converts Date objects to ISO strings for JSON serialization
 */
type LockResponse = {
  courseId: string;
  lockedAt: string;
  lockedBy: string;
  expiresAt: string;
};

// ============================================================================
// Locks Router
// ============================================================================

/**
 * Locks router for generation lock management
 *
 * Provides endpoints for checking and managing distributed locks that prevent
 * concurrent course generation. Uses Redis-backed GenerationLockService for
 * atomic lock operations with auto-expiration.
 */
export const locksRouter = router({
  /**
   * Check if a course is currently locked
   *
   * Purpose: Quick check to determine if a course has an active generation lock.
   * Use this before starting generation to provide immediate feedback to users.
   *
   * Authorization: Requires authentication (protected procedure)
   *
   * Input:
   * - courseId: UUID of the course to check
   *
   * Output:
   * - boolean: true if locked, false if unlocked
   *
   * Error Handling:
   * - Invalid courseId -> 400 BAD_REQUEST (Zod validation)
   * - Unauthenticated -> 401 UNAUTHORIZED
   * - Redis error -> Returns true (safe default to prevent race conditions)
   *
   * @example
   * ```typescript
   * const locked = await trpc.locks.isLocked.query({ courseId: '...' });
   * if (locked) {
   *   console.log('Course generation in progress');
   * }
   * ```
   */
  isLocked: protectedProcedure
    .input(courseIdSchema)
    .query(async ({ input }) => {
      return generationLockService.isLocked(input.courseId);
    }),

  /**
   * Get lock details for a course
   *
   * Purpose: Retrieve detailed information about an active lock, including
   * who holds it and when it will expire. Useful for displaying lock status
   * in the UI and debugging lock issues.
   *
   * Authorization: Requires authentication (protected procedure)
   *
   * Input:
   * - courseId: UUID of the course to get lock info for
   *
   * Output:
   * - null if no lock exists
   * - Object with lock details if locked:
   *   - courseId: Course UUID
   *   - lockedAt: ISO timestamp when lock was acquired
   *   - lockedBy: Worker/job ID holding the lock
   *   - expiresAt: ISO timestamp when lock will auto-expire
   *
   * Error Handling:
   * - Invalid courseId -> 400 BAD_REQUEST (Zod validation)
   * - Unauthenticated -> 401 UNAUTHORIZED
   * - Redis error -> Returns null (logged internally)
   *
   * @example
   * ```typescript
   * const lock = await trpc.locks.getLock.query({ courseId: '...' });
   * if (lock) {
   *   console.log(`Locked by ${lock.lockedBy} until ${lock.expiresAt}`);
   * }
   * ```
   */
  getLock: protectedProcedure
    .input(courseIdSchema)
    .query(async ({ input }): Promise<LockResponse | null> => {
      const lock = await generationLockService.getLock(input.courseId);

      if (!lock) {
        return null;
      }

      // Convert Date objects to ISO strings for JSON serialization
      return {
        courseId: lock.courseId,
        lockedAt: lock.lockedAt.toISOString(),
        lockedBy: lock.lockedBy,
        expiresAt: lock.expiresAt.toISOString(),
      };
    }),

  /**
   * Get all active locks (admin only)
   *
   * Purpose: Administrative view of all active generation locks across the system.
   * Useful for monitoring system load, identifying stuck locks, and debugging
   * concurrency issues.
   *
   * Authorization: Requires admin role (admin procedure)
   *
   * Input: None
   *
   * Output:
   * - Array of lock details:
   *   - courseId: Course UUID
   *   - lockedAt: ISO timestamp when lock was acquired
   *   - lockedBy: Worker/job ID holding the lock
   *   - expiresAt: ISO timestamp when lock will auto-expire
   *
   * Error Handling:
   * - Unauthenticated -> 401 UNAUTHORIZED
   * - Not admin -> 403 FORBIDDEN
   * - Redis error -> Returns empty array (logged internally)
   *
   * @example
   * ```typescript
   * const locks = await trpc.locks.getAllLocks.query();
   * console.log(`${locks.length} active generation locks`);
   * ```
   */
  getAllLocks: adminProcedure.query(async (): Promise<LockResponse[]> => {
    const locks = await generationLockService.getAllLocks();

    // Convert Date objects to ISO strings for JSON serialization
    return locks.map((lock) => ({
      courseId: lock.courseId,
      lockedAt: lock.lockedAt.toISOString(),
      lockedBy: lock.lockedBy,
      expiresAt: lock.expiresAt.toISOString(),
    }));
  }),

  /**
   * Force release a lock (admin only)
   *
   * Purpose: Administrative operation to forcibly release a generation lock.
   * Use this for recovering from stuck workers, crashed jobs, or when a lock
   * needs to be manually cleared. This operation bypasses holder verification.
   *
   * WARNING: Force releasing a lock while generation is in progress may cause
   * data inconsistency. Only use when certain the lock holder is dead.
   *
   * Authorization: Requires admin role (admin procedure)
   *
   * Input:
   * - courseId: UUID of the course to release lock for
   *
   * Output:
   * - success: true if lock was released, false if lock didn't exist
   *
   * Error Handling:
   * - Invalid courseId -> 400 BAD_REQUEST (Zod validation)
   * - Unauthenticated -> 401 UNAUTHORIZED
   * - Not admin -> 403 FORBIDDEN
   * - Redis error -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const { success } = await trpc.locks.forceRelease.mutate({ courseId: '...' });
   * if (success) {
   *   console.log('Lock released successfully');
   * } else {
   *   console.log('No lock found for course');
   * }
   * ```
   */
  forceRelease: adminProcedure
    .input(courseIdSchema)
    .mutation(async ({ input, ctx }) => {
      const { courseId } = input;

      // Log the admin action for audit purposes
      logger.warn(
        {
          operation: 'admin_force_release',
          courseId,
          adminId: ctx.user?.id,
          adminEmail: ctx.user?.email,
        },
        'Admin force-releasing generation lock'
      );

      try {
        const success = await generationLockService.forceRelease(courseId);

        return { success };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error(
          {
            operation: 'admin_force_release_error',
            courseId,
            adminId: ctx.user?.id,
            error: errorMessage,
          },
          'Error force-releasing generation lock'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to release lock: ${errorMessage}`,
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type LocksRouter = typeof locksRouter;
