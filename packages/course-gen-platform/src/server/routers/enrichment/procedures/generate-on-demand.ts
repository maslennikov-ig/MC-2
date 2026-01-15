/**
 * Generate On-Demand Enrichment Procedure
 * @module server/routers/enrichment/procedures/generate-on-demand
 *
 * Creates an enrichment for on-demand generation from the course viewer UI.
 * Called when users click "Generate" on placeholder enrichment cards.
 *
 * This procedure:
 * 1. Validates the enrichment type is allowed for on-demand generation
 * 2. Verifies user access to the lesson via organization membership
 * 3. Checks if enrichment of this type already exists (prevents duplicates)
 * 4. Creates enrichment record with status='pending'
 * 5. Queues BullMQ job to stage7-enrichments queue
 * 6. Returns enrichment ID for UI to start polling
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { generateOnDemandInputSchema, isOnDemandType } from '@megacampus/shared-types';
import {
  verifyLessonAccess,
  getNextOrderIndex,
  isTwoStageType,
  checkExistingEnrichment,
} from '../helpers';
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
 * Generate on-demand enrichment for a lesson
 *
 * Purpose: Creates an enrichment record for on-demand generation from
 * the course viewer UI. Only allows quiz, audio, and presentation types.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - lessonId: UUID of the target lesson
 * - enrichmentType: Type of enrichment (quiz, audio, presentation only)
 * - settings: Optional type-specific generation settings
 *
 * Output:
 * - enrichmentId: UUID of created enrichment
 * - status: Initial status ('pending')
 * - jobId: BullMQ job ID for tracking
 *
 * Rate Limit: 5 generations per minute (more restrictive than batch create)
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.generateOnDemand.mutate({
 *   lessonId: 'lesson-uuid',
 *   enrichmentType: 'quiz',
 *   settings: { questionCount: 5 },
 * });
 * // { enrichmentId: 'uuid', status: 'pending', jobId: 'job-id' }
 * ```
 */
export const generateOnDemand = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 generations per minute
  .input(generateOnDemandInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { lessonId, enrichmentType, settings } = input;
    const requestId = nanoid();
    const enrichmentId = crypto.randomUUID();

    const currentUser = ctx.user;

    logger.info(
      {
        requestId,
        lessonId,
        enrichmentType,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
      },
      'Generate on-demand enrichment request'
    );

    try {
      // Step 1: Validate enrichment type is allowed for on-demand
      if (!isOnDemandType(enrichmentType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Enrichment type '${enrichmentType}' cannot be generated on-demand.`,
        });
      }

      // Step 2: Verify lesson access and get course info
      const lesson = await verifyLessonAccess(
        lessonId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 3: Check if enrichment of this type already exists for lesson
      const existing = await checkExistingEnrichment(lessonId, enrichmentType, requestId);

      if (existing.exists) {
        logger.warn(
          {
            requestId,
            lessonId,
            enrichmentType,
            existingId: existing.enrichmentId,
            existingStatus: existing.status,
          },
          'Enrichment of this type already exists'
        );

        throw new TRPCError({
          code: 'CONFLICT',
          message: `An ${enrichmentType} enrichment already exists for this lesson.`,
        });
      }

      // Step 4: Get next order index
      const supabase = getSupabaseAdmin();
      const orderIndex = await getNextOrderIndex(lessonId);

      // Step 5: Determine initial status (two-stage types start with draft generation)
      const initialStatus = isTwoStageType(enrichmentType) ? 'pending' : 'pending';

      // Step 6: Insert enrichment record
      const { error: insertError } = await supabase.from('lesson_enrichments').insert({
        id: enrichmentId,
        lesson_id: lessonId,
        course_id: lesson.course_id,
        enrichment_type: enrichmentType,
        order_index: orderIndex,
        title: null,
        content: null,
        asset_id: null,
        status: initialStatus,
        generation_attempt: 0,
        error_message: null,
        error_details: null,
        metadata: {},
      });

      if (insertError) {
        logger.error(
          {
            requestId,
            enrichmentId,
            lessonId,
            error: insertError.message,
          },
          'Failed to insert enrichment record'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unable to create enrichment. Please try again later.',
        });
      }

      // Step 7: Enqueue BullMQ job
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
        jobId: `enrich-ondemand-${enrichmentId}`,
      });

      logger.info(
        {
          requestId,
          enrichmentId,
          lessonId,
          enrichmentType,
          jobId: job.id,
          orderIndex,
        },
        'On-demand enrichment created and job enqueued'
      );

      return {
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
      logger.error(
        {
          requestId,
          lessonId,
          enrichmentType,
          error: error instanceof Error ? error.message : String(error),
        },
        'Generate on-demand enrichment failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to start generation. Please try again later.',
      });
    }
  });
