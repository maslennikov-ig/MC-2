/**
 * Create Enrichment Procedure
 * @module server/routers/enrichment/procedures/create
 *
 * Creates a single enrichment for a lesson and enqueues a BullMQ job.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { createEnrichmentInputSchema } from '../schemas';
import { verifyLessonAccess, getNextOrderIndex, isTwoStageType } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../../../../stages/stage7-enrichments/factory';
import type { Stage7JobInput } from '../../../../stages/stage7-enrichments/types';
import { logger } from '../../../../shared/logger/index.js';

// Create queue instance (singleton)
let stage7Queue: ReturnType<typeof createStage7Queue> | null = null;

function getQueue() {
  if (!stage7Queue) {
    stage7Queue = createStage7Queue();
  }
  return stage7Queue;
}

/**
 * Create a single enrichment for a lesson
 *
 * Purpose: Creates an enrichment record with status='pending' and enqueues
 * a BullMQ job for generation.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - lessonId: UUID of the target lesson
 * - enrichmentType: Type of enrichment (video, audio, presentation, quiz, document)
 * - settings: Optional type-specific generation settings
 * - title: Optional custom title
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of created enrichment
 * - status: Initial status ('pending')
 * - jobId: BullMQ job ID for tracking
 *
 * Rate Limit: 10 creates per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.create.mutate({
 *   lessonId: 'lesson-uuid',
 *   enrichmentType: 'audio',
 *   settings: { voice_id: 'nova' },
 * });
 * // { success: true, enrichmentId: 'uuid', status: 'pending', jobId: 'job-id' }
 * ```
 */
export const create = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 creates per minute
  .input(createEnrichmentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { lessonId, enrichmentType, settings, title } = input;
    const requestId = nanoid();
    const enrichmentId = crypto.randomUUID();

    const currentUser = ctx.user;

    logger.info({
      requestId,
      lessonId,
      enrichmentType,
      userId: currentUser.id,
      organizationId: currentUser.organizationId,
    }, 'Create enrichment request');

    try {
      // Step 1: Verify lesson access and get course info
      const lesson = await verifyLessonAccess(
        lessonId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Get next order index
      const orderIndex = await getNextOrderIndex(lessonId);

      // Step 3: Determine initial status (two-stage types start with draft generation)
      const initialStatus = isTwoStageType(enrichmentType) ? 'pending' : 'pending';

      // Step 4: Insert enrichment record
      const supabase = getSupabaseAdmin();
      const { error: insertError } = await supabase
        .from('lesson_enrichments')
        .insert({
          id: enrichmentId,
          lesson_id: lessonId,
          course_id: lesson.course_id,
          enrichment_type: enrichmentType,
          order_index: orderIndex,
          title: title || null,
          content: null,
          asset_id: null,
          status: initialStatus,
          generation_attempt: 0,
          error_message: null,
          error_details: null,
          metadata: {},
        });

      if (insertError) {
        logger.error({
          requestId,
          enrichmentId,
          lessonId,
          error: insertError.message,
        }, 'Failed to insert enrichment record');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create enrichment record',
        });
      }

      // Step 5: Enqueue BullMQ job
      const queue = getQueue();
      const jobInput: Stage7JobInput = {
        enrichmentId,
        enrichmentType,
        lessonId,
        courseId: lesson.course_id,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        settings: settings || {},
        retryAttempt: 0,
        isDraftPhase: isTwoStageType(enrichmentType),
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-${enrichmentId}`,
      });

      logger.info({
        requestId,
        enrichmentId,
        lessonId,
        enrichmentType,
        jobId: job.id,
        orderIndex,
      }, 'Enrichment created and job enqueued');

      return {
        success: true,
        enrichmentId,
        status: initialStatus as 'pending',
        jobId: job.id,
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        lessonId,
        enrichmentType,
        error: error instanceof Error ? error.message : String(error),
      }, 'Create enrichment failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create enrichment',
      });
    }
  });
