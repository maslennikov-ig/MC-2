/**
 * Create Batch Enrichments Procedure
 * @module server/routers/enrichment/procedures/create-batch
 *
 * Creates enrichments for multiple lessons in a single batch operation.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { createBatchEnrichmentInputSchema } from '../schemas';
import { getNextOrderIndex, isTwoStageType } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../../../../stages/stage7-enrichments/factory';
import type { Stage7JobInput } from '../../../../stages/stage7-enrichments/types';
import type { EnrichmentType, EnrichmentStatus } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger/index.js';

// Create queue instance (singleton)
let stage7Queue: ReturnType<typeof createStage7Queue> | null = null;

function getQueue() {
  if (!stage7Queue) {
    stage7Queue = createStage7Queue();
  }
  return stage7Queue;
}

// Define the expected lesson type from the join query
interface LessonWithSection {
  id: string;
  title: string;
  section_id: string;
  sections: {
    course_id: string;
    courses: {
      user_id: string;
      organization_id: string;
    };
  };
}

/**
 * Create enrichments for multiple lessons
 *
 * Purpose: Creates enrichments for multiple lessons in a single batch operation.
 * Useful for "Generate audio for all lessons in module" type operations.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - lessonIds: Array of lesson UUIDs (1-100)
 * - enrichmentType: Type of enrichment to create for all lessons
 * - settings: Optional type-specific generation settings
 *
 * Output:
 * - success: Boolean success flag
 * - created: Number of enrichments created
 * - enrichmentIds: Array of created enrichment UUIDs
 * - jobIds: Array of BullMQ job IDs for tracking
 *
 * Rate Limit: 3 batch operations per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.createBatch.mutate({
 *   lessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
 *   enrichmentType: 'audio',
 *   settings: { voice_id: 'nova' },
 * });
 * // { success: true, created: 3, enrichmentIds: [...], jobIds: [...] }
 * ```
 */
export const createBatch = protectedProcedure
  .use(createRateLimiter({ requests: 3, window: 60 })) // 3 batch ops per minute
  .input(createBatchEnrichmentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { lessonIds, enrichmentType, settings } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      lessonCount: lessonIds.length,
      enrichmentType,
      userId: currentUser.id,
      organizationId: currentUser.organizationId,
    }, 'Create batch enrichments request');

    try {
      // Step 1: Get all lessons and verify they belong to accessible courses
      // lessons -> sections -> courses join
      const supabase = getSupabaseAdmin();
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, section_id, sections!inner(course_id, courses!inner(user_id, organization_id))')
        .in('id', lessonIds);

      if (lessonsError) {
        logger.error({
          requestId,
          error: lessonsError.message,
        }, 'Failed to fetch lessons');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify lessons',
        });
      }

      // Type cast the response
      const lessons = lessonsData as unknown as LessonWithSection[];

      // Check if all lessons were found
      if (!lessons || lessons.length !== lessonIds.length) {
        const foundIds = new Set(lessons?.map(l => l.id) || []);
        const missingIds = lessonIds.filter(id => !foundIds.has(id));

        logger.warn({
          requestId,
          missingIds,
        }, 'Some lessons not found');

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Lessons not found: ${missingIds.join(', ')}`,
        });
      }

      // Step 2: Verify access to all courses
      const courseIds = new Set<string>();
      for (const lesson of lessons) {
        const section = lesson.sections;
        const course = section.courses;
        const courseId = section.course_id;

        // Check ownership or same organization
        if (course.user_id !== currentUser.id && course.organization_id !== currentUser.organizationId) {
          logger.warn({
            requestId,
            lessonId: lesson.id,
            courseId,
            userId: currentUser.id,
          }, 'Access denied to lesson in batch');

          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `You do not have access to lesson ${lesson.id}`,
          });
        }
        courseIds.add(courseId);
      }

      // Step 3: Get next order index for each lesson
      const orderIndices = new Map<string, number>();
      for (const lessonId of lessonIds) {
        const orderIndex = await getNextOrderIndex(lessonId);
        orderIndices.set(lessonId, orderIndex);
      }

      // Step 4: Create enrichment records
      const initialStatus: EnrichmentStatus = 'pending';
      const enrichmentRecords = lessons.map(lesson => {
        const courseId = lesson.sections.course_id;
        return {
          id: crypto.randomUUID(),
          lesson_id: lesson.id,
          course_id: courseId,
          enrichment_type: enrichmentType as EnrichmentType,
          order_index: orderIndices.get(lesson.id) || 1,
          title: null as string | null,
          content: null,
          asset_id: null as string | null,
          status: initialStatus,
          generation_attempt: 0,
          error_message: null as string | null,
          error_details: null,
          metadata: {},
        };
      });

      const { error: insertError } = await supabase
        .from('lesson_enrichments')
        .insert(enrichmentRecords);

      if (insertError) {
        logger.error({
          requestId,
          error: insertError.message,
          lessonCount: lessonIds.length,
        }, 'Failed to insert batch enrichment records');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create enrichment records',
        });
      }

      // Step 5: Enqueue BullMQ jobs for all enrichments in parallel
      const queue = getQueue();
      const jobPromises = enrichmentRecords.map(record => {
        const jobInput: Stage7JobInput = {
          enrichmentId: record.id,
          enrichmentType,
          lessonId: record.lesson_id,
          courseId: record.course_id,
          userId: currentUser.id,
          organizationId: currentUser.organizationId,
          settings: settings || {},
          retryAttempt: 0,
          isDraftPhase: isTwoStageType(enrichmentType),
        };

        return addEnrichmentJob(queue, jobInput, {
          jobId: `enrich-${record.id}`,
        });
      });

      const jobs = await Promise.all(jobPromises);

      const enrichmentIds = enrichmentRecords.map(r => r.id);
      const jobIds = jobs.map(j => j.id).filter((id): id is string => id !== undefined);

      logger.info({
        requestId,
        created: enrichmentRecords.length,
        enrichmentIds,
        jobIds,
        enrichmentType,
      }, 'Batch enrichments created and jobs enqueued');

      return {
        success: true,
        created: enrichmentRecords.length,
        enrichmentIds,
        jobIds,
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        lessonCount: lessonIds.length,
        enrichmentType,
        error: error instanceof Error ? error.message : String(error),
      }, 'Create batch enrichments failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create batch enrichments',
      });
    }
  });
