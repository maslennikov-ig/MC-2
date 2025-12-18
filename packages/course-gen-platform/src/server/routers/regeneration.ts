/**
 * Regeneration Router
 * @module server/routers/regeneration
 *
 * Handles section regeneration operations for course structures (FR-026).
 * Extracted from generation.ts to reduce file size and improve maintainability.
 *
 * Procedures:
 * - `regenerateSection` - Regenerate a single section within existing course
 * - `batchRegenerateSections` - Regenerate multiple sections (future)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { instructorProcedure } from '../procedures';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { nanoid } from 'nanoid';
import { ConcurrencyTracker } from '../../shared/concurrency/tracker';
import { SectionRegenerationService } from '../../stages/stage5-generation/utils/section-regeneration-service';
import { SectionBatchGenerator } from '../../stages/stage5-generation/utils/section-batch-generator';

// Type definitions
interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: 'user_limit' | 'global_limit' | 'success';
  current_user_jobs?: number;
  user_limit?: number;
  current_global_jobs?: number;
  global_limit?: number;
}

/**
 * Input schema for section regeneration (FR-026)
 *
 * This schema validates the input for regenerating a single section
 * within an existing course structure.
 */
export const regenerateSectionInputSchema = z.object({
  /** Course ID to regenerate section for */
  courseId: z.string().uuid('Invalid course ID'),

  /** Section number to regenerate (1-indexed) */
  sectionNumber: z.number().int().min(1, 'Section number must be at least 1'),
});

/**
 * Input schema for batch section regeneration
 *
 * This schema validates the input for regenerating multiple sections
 * at once within an existing course structure.
 */
export const batchRegenerateSectionsInputSchema = z.object({
  /** Course ID to regenerate sections for */
  courseId: z.string().uuid('Invalid course ID'),

  /** Section numbers to regenerate (1-indexed) */
  sectionNumbers: z
    .array(z.number().int().min(1, 'Section number must be at least 1'))
    .min(1, 'At least one section number required')
    .max(10, 'Maximum 10 sections per batch'),
});

/**
 * Regeneration router
 *
 * Provides endpoints for:
 * - Single section regeneration (regeneration.regenerateSection)
 * - Batch section regeneration (regeneration.batchRegenerateSections)
 */
export const regenerationRouter = router({
  /**
   * Regenerate a single section (FR-026)
   *
   * Purpose: Regenerate a specific section within an existing course structure without
   * regenerating the entire course. This endpoint is useful for refining individual
   * sections after initial generation or when user feedback requires section updates.
   *
   * Authorization: Requires instructor or admin role (user must own the course)
   *
   * Input:
   * - courseId: UUID of the course containing the section
   * - sectionNumber: Section number to regenerate (1-indexed)
   *
   * Output:
   * - courseId: Course UUID
   * - sectionNumber: Regenerated section number
   * - status: 'regenerated' confirmation
   * - updatedAt: ISO 8601 timestamp of completion
   *
   * Workflow:
   * 1. Verify course exists and user owns it (RLS check)
   * 2. Check concurrency limits (ConcurrencyTracker, same as generate endpoint)
   * 3. Instantiate SectionRegenerationService
   * 4. Call service.regenerateSection() for atomic section replacement
   * 5. Release concurrency slot
   * 6. Return success response
   *
   * Error Handling:
   * - Invalid JWT -> 401 UNAUTHORIZED
   * - User doesn't own course -> 403 FORBIDDEN
   * - Course not found -> 404 NOT_FOUND
   * - Invalid sectionNumber (out of range) -> 400 BAD_REQUEST
   * - Concurrency limit exceeded -> 429 TOO_MANY_REQUESTS
   * - Service failure -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.regeneration.regenerateSection.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   sectionNumber: 2,
   * });
   * // { courseId: '...', sectionNumber: 2, status: 'regenerated', updatedAt: '2025-01-13T...' }
   * ```
   */
  regenerateSection: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 regenerations per minute
    .input(regenerateSectionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, sectionNumber } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const userId = currentUser.id;
      const organizationId = currentUser.organizationId;

      // Initialize concurrency tracker for cleanup in error paths
      let concurrencyTracker: ConcurrencyTracker | undefined;

      try {
        // Step 1: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, organization_id, user_id, organization:organizations(tier)')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 2: Check concurrency limits (same as generate endpoint)
        const dbTier = ((course as any).organization?.tier || 'free') as string;
        const tierMap: Record<string, 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM'> = {
          'trial': 'TRIAL',
          'free': 'FREE',
          'basic': 'BASIC',
          'standard': 'STANDARD',
          'premium': 'PREMIUM',
        };
        const tier = tierMap[dbTier] || 'FREE';

        concurrencyTracker = new ConcurrencyTracker();
        const concurrencyCheck: ConcurrencyCheckResult = await concurrencyTracker.checkAndReserve(userId, tier);

        if (!concurrencyCheck.allowed) {
          logger.warn({
            requestId,
            userId,
            tier,
            concurrencyCheck,
          }, 'Concurrency limit hit');

          const errorMessage =
            concurrencyCheck?.reason === 'user_limit'
              ? `Too many concurrent operations. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent regenerations.`
              : 'System at capacity. Please try again in a few minutes.';

          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: errorMessage,
          });
        }

        // Step 3: Instantiate service
        const sectionBatchGenerator = new SectionBatchGenerator();
        const service = new SectionRegenerationService(
          sectionBatchGenerator,
          undefined // No QdrantClient for now
        );

        // Step 4: Call service
        logger.info({
          requestId,
          courseId,
          sectionNumber,
          userId,
        }, 'Starting section regeneration');

        await service.regenerateSection(courseId, sectionNumber, userId, organizationId);

        // Step 5: Release concurrency slot
        await concurrencyTracker.release(userId);

        logger.info({
          requestId,
          courseId,
          sectionNumber,
        }, 'Section regeneration completed');

        // Step 6: Return success response
        return {
          courseId,
          sectionNumber,
          status: 'regenerated' as const,
          updatedAt: new Date().toISOString(),
        };

      } catch (error) {
        // Release concurrency slot on error
        if (concurrencyTracker) {
          await concurrencyTracker.release(userId).catch((releaseError) => {
            logger.error({
              requestId,
              error: releaseError,
            }, 'Failed to release concurrency slot after error');
          });
        }

        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Handle service-level errors
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Map service errors to tRPC error codes
        if (errorMessage.includes('Invalid section number')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: errorMessage,
          });
        }

        if (errorMessage.includes('Course structure not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course structure not found',
          });
        }

        logger.error({
          requestId,
          error: errorMessage,
          courseId,
          sectionNumber,
        }, 'Section regeneration failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Section regeneration failed',
        });
      }
    }),

  /**
   * Batch regenerate multiple sections
   *
   * Purpose: Regenerate multiple sections within an existing course structure
   * in a single request. More efficient than calling regenerateSection multiple times.
   *
   * Authorization: Requires instructor or admin role (user must own the course)
   *
   * Input:
   * - courseId: UUID of the course containing the sections
   * - sectionNumbers: Array of section numbers to regenerate (1-indexed, max 10)
   *
   * Output:
   * - courseId: Course UUID
   * - sectionNumbers: Array of regenerated section numbers
   * - status: 'regenerated' confirmation
   * - updatedAt: ISO 8601 timestamp of completion
   * - regeneratedCount: Number of sections successfully regenerated
   *
   * @example
   * ```typescript
   * const result = await trpc.regeneration.batchRegenerateSections.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   sectionNumbers: [1, 3, 5],
   * });
   * // { courseId: '...', sectionNumbers: [1, 3, 5], status: 'regenerated', ... }
   * ```
   */
  batchRegenerateSections: instructorProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 batch regenerations per minute
    .input(batchRegenerateSectionsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, sectionNumbers } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const userId = currentUser.id;
      const organizationId = currentUser.organizationId;

      let concurrencyTracker: ConcurrencyTracker | undefined;

      try {
        // Step 1: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, organization_id, user_id, organization:organizations(tier)')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        if (course.user_id !== userId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 2: Check concurrency limits
        const dbTier = ((course as any).organization?.tier || 'free') as string;
        const tierMap: Record<string, 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM'> = {
          'trial': 'TRIAL',
          'free': 'FREE',
          'basic': 'BASIC',
          'standard': 'STANDARD',
          'premium': 'PREMIUM',
        };
        const tier = tierMap[dbTier] || 'FREE';

        concurrencyTracker = new ConcurrencyTracker();
        const concurrencyCheck: ConcurrencyCheckResult = await concurrencyTracker.checkAndReserve(userId, tier);

        if (!concurrencyCheck.allowed) {
          const errorMessage =
            concurrencyCheck?.reason === 'user_limit'
              ? `Too many concurrent operations. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent regenerations.`
              : 'System at capacity. Please try again in a few minutes.';

          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: errorMessage,
          });
        }

        // Step 3: Instantiate service
        const sectionBatchGenerator = new SectionBatchGenerator();
        const service = new SectionRegenerationService(
          sectionBatchGenerator,
          undefined
        );

        // Step 4: Regenerate sections sequentially
        logger.info({
          requestId,
          courseId,
          sectionNumbers,
          userId,
        }, 'Starting batch section regeneration');

        const regeneratedSections: number[] = [];
        const errors: Array<{ sectionNumber: number; error: string }> = [];

        for (const sectionNumber of sectionNumbers) {
          try {
            await service.regenerateSection(courseId, sectionNumber, userId, organizationId);
            regeneratedSections.push(sectionNumber);
          } catch (sectionError) {
            errors.push({
              sectionNumber,
              error: sectionError instanceof Error ? sectionError.message : String(sectionError),
            });
            logger.warn({
              requestId,
              courseId,
              sectionNumber,
              error: sectionError,
            }, 'Failed to regenerate section in batch');
          }
        }

        // Step 5: Release concurrency slot
        await concurrencyTracker.release(userId);

        logger.info({
          requestId,
          courseId,
          regeneratedCount: regeneratedSections.length,
          failedCount: errors.length,
        }, 'Batch section regeneration completed');

        // Step 6: Return response
        if (regeneratedSections.length === 0) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `All sections failed to regenerate: ${errors.map(e => e.error).join('; ')}`,
          });
        }

        return {
          courseId,
          sectionNumbers: regeneratedSections,
          status: 'regenerated' as const,
          updatedAt: new Date().toISOString(),
          regeneratedCount: regeneratedSections.length,
          errors: errors.length > 0 ? errors : undefined,
        };

      } catch (error) {
        if (concurrencyTracker) {
          await concurrencyTracker.release(userId).catch(() => {});
        }

        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          requestId,
          error: error instanceof Error ? error.message : String(error),
          courseId,
          sectionNumbers,
        }, 'Batch section regeneration failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Batch section regeneration failed',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type RegenerationRouter = typeof regenerationRouter;
