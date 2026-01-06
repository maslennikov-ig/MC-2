/**
 * Approve Lessons (Batch) Procedure
 * @module server/routers/lesson-content/procedures/approve-lessons
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { approveLessonsInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Schema for lesson_contents.metadata JSONB column
 * Using passthrough() to preserve unknown fields
 */
const LessonMetadataSchema = z.object({
  cost_usd: z.number().optional(),
  quality_score: z.number().optional(),
  generation_duration_ms: z.number().optional(),
  total_tokens: z.number().optional(),
  approved_at: z.string().optional(),
  approved_by: z.string().uuid().optional(),
}).passthrough();

/**
 * Safely parse metadata from Json type
 * Returns empty object if parsing fails (instead of crashing)
 */
function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const result = LessonMetadataSchema.safeParse(metadata);
  if (result.success) {
    return result.data;
  }

  // If validation fails, still return the raw object but log warning
  logger.warn({ metadata, error: result.error }, 'Invalid metadata format, using raw object');
  return metadata as Record<string, unknown>;
}

/**
 * Extract only known safe metadata fields
 * Prevents leaking sensitive data that might be in metadata
 */
function getSafeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const safeFields = [
    'cost_usd',
    'quality_score',
    'generation_duration_ms',
    'total_tokens',
    'model_used',
    'prompt_tokens',
    'completion_tokens',
  ];

  const result: Record<string, unknown> = {};
  for (const field of safeFields) {
    if (metadata[field] !== undefined) {
      result[field] = metadata[field];
    }
  }
  return result;
}

/**
 * Batch approve lessons for a course or specific module
 *
 * Purpose: Marks multiple lessons as approved after user review. Updates lesson_contents
 * status to 'approved' and records approval metadata for all qualifying lessons.
 * Only lessons with status 'completed' will be approved (skips pending, error, already approved).
 *
 * Authorization:
 * - Requires authenticated user (protectedProcedure middleware)
 * - User must have access to the course (verifyCourseAccess check)
 * - Any course member can approve lessons (owner, admin, or organization member)
 * - Rate limited: 30 batch approvals per minute per user
 *
 * Input:
 * - courseId: UUID of the course
 * - moduleNumber: Optional module number (1-based). If provided, only approve lessons in that module.
 *
 * Output:
 * - success: Boolean success flag
 * - approvedCount: Number of lessons that were approved
 * - skippedCount: Number of lessons that were skipped (not in 'completed' status)
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Module not found -> 404 NOT_FOUND (when moduleNumber provided)
 *
 * @example
 * ```typescript
 * // Approve all completed lessons in course
 * const result = await trpc.lessonContent.approveLessons.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 * });
 * // { success: true, approvedCount: 15, skippedCount: 3 }
 *
 * // Approve only lessons in module 2
 * const result = await trpc.lessonContent.approveLessons.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   moduleNumber: 2,
 * });
 * // { success: true, approvedCount: 5, skippedCount: 1 }
 * ```
 */
export const approveLessons = protectedProcedure
  .use(createRateLimiter({ requests: 30, window: 60 })) // 30 batch approvals per minute
  .input(approveLessonsInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, moduleNumber } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info(
      { requestId, courseId, moduleNumber, userId: currentUser.id },
      'Batch approve lessons request'
    );

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      const supabase = getSupabaseAdmin();
      let lessonIds: string[] | null = null;

      // Step 2: If moduleNumber provided, get lesson IDs from that section
      if (moduleNumber !== undefined) {
        // Get section by course_id and order_index = moduleNumber
        const { data: section, error: sectionError } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId)
          .eq('order_index', moduleNumber)
          .single();

        if (sectionError || !section) {
          logger.warn(
            { requestId, courseId, moduleNumber, error: sectionError?.message },
            'Module not found'
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Module ${moduleNumber} not found`,
          });
        }

        // Get all lesson IDs from that section
        const { data: lessons, error: lessonsError } = await supabase
          .from('lessons')
          .select('id')
          .eq('section_id', section.id);

        if (lessonsError) {
          logger.error(
            { requestId, courseId, moduleNumber, error: lessonsError.message },
            'Failed to fetch lessons for module'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch lessons for module',
          });
        }

        lessonIds = lessons?.map((l) => l.id) || [];

        if (lessonIds.length === 0) {
          logger.info({ requestId, courseId, moduleNumber }, 'No lessons found in module');
          return { success: true, approvedCount: 0, skippedCount: 0 };
        }

        logger.debug(
          { requestId, courseId, moduleNumber, lessonCount: lessonIds.length },
          'Found lessons in module'
        );
      }

      // Step 3: Count lessons to be skipped (not in 'completed' status)
      let countQuery = supabase
        .from('lesson_contents')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .neq('status', 'completed');

      if (lessonIds !== null) {
        countQuery = countQuery.in('lesson_id', lessonIds);
      }

      const { count: skippedCount, error: countError } = await countQuery;

      if (countError) {
        logger.error(
          { requestId, error: countError.message },
          'Failed to count skipped lessons'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to count lessons',
        });
      }

      // Step 4: Get all lesson_contents with status 'completed' to update
      let selectQuery = supabase
        .from('lesson_contents')
        .select('id, course_id, lesson_id, metadata')
        .eq('course_id', courseId)
        .eq('status', 'completed');

      if (lessonIds !== null) {
        selectQuery = selectQuery.in('lesson_id', lessonIds);
      }

      const { data: lessonsToApprove, error: selectError } = await selectQuery;

      if (selectError) {
        logger.error(
          { requestId, error: selectError.message },
          'Failed to fetch lessons to approve'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lessons',
        });
      }

      if (!lessonsToApprove || lessonsToApprove.length === 0) {
        logger.info({ requestId, courseId, moduleNumber }, 'No completed lessons to approve');
        return { success: true, approvedCount: 0, skippedCount: skippedCount || 0 };
      }

      // Step 5: Update all qualifying lessons with a single batch upsert
      const now = new Date().toISOString();

      // Build array of updates with pre-computed metadata (include required fields for upsert)
      const updates = lessonsToApprove.map((lesson) => {
        const currentMetadata = parseMetadata(lesson.metadata);
        const safeMetadata = getSafeMetadata(currentMetadata);

        return {
          id: lesson.id,
          course_id: lesson.course_id,
          lesson_id: lesson.lesson_id,
          status: 'approved',
          updated_at: now,
          metadata: {
            ...safeMetadata,
            approved_at: now,
            approved_by: currentUser.id,
          },
        };
      });

      // Single upsert for all lessons (O(1) instead of O(n) queries)
      const { error: updateError, data: updatedLessons } = await supabase
        .from('lesson_contents')
        .upsert(updates, { onConflict: 'id' })
        .select('id');

      if (updateError) {
        logger.error(
          { requestId, error: updateError.message, lessonCount: updates.length },
          'Failed to batch approve lessons'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve lessons',
        });
      }

      const approvedCount = updatedLessons?.length ?? updates.length;

      logger.info(
        {
          requestId,
          courseId,
          moduleNumber,
          approvedCount,
          skippedCount: skippedCount || 0,
          totalFound: lessonsToApprove.length,
        },
        'Batch approve lessons completed'
      );

      return {
        success: true,
        approvedCount,
        skippedCount: skippedCount || 0,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        { requestId, error: error instanceof Error ? error.message : String(error) },
        'Batch approve lessons failed'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to approve lessons',
      });
    }
  });
