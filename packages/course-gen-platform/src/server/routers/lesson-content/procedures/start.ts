/**
 * Start Stage 6 Procedure
 * @module server/routers/lesson-content/procedures/start
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { startStage6InputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { enqueueStage6Lesson } from '../../../../stages/stage6-lesson-content/enqueue';
import type { CourseStyle } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Start Stage 6 generation for a course
 *
 * Purpose: Enqueues all lesson specifications for parallel processing via BullMQ.
 * Each lesson is processed independently by the Stage 6 worker with 30 concurrent workers.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course to generate lessons for
 * - lessonSpecs: Array of LessonSpecificationV2 objects
 * - priority (optional): Job priority 1-10, default 5
 *
 * Output:
 * - success: Boolean success flag
 * - jobCount: Number of jobs enqueued
 * - jobIds: Array of BullMQ job IDs for tracking
 *
 * Validation:
 * - Course exists and user has access
 * - At least one lesson specification provided
 * - All lesson specs pass LessonSpecificationV2 validation
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Invalid lesson specs -> 400 BAD_REQUEST
 * - Queue error -> 500 INTERNAL_SERVER_ERROR
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.startStage6.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonSpecs: [lessonSpec1, lessonSpec2],
 *   priority: 7,
 * });
 * // { success: true, jobCount: 2, jobIds: ['job1', 'job2'] }
 * ```
 */
export const startStage6 = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 Stage 6 starts per minute
  .input(startStage6InputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonSpecs, priority } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    logger.info(
      {
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        lessonCount: lessonSpecs.length,
        priority,
      },
      'Stage 6 start request'
    );

    try {
      // Step 1: Verify course access and get course language
      const course = await verifyCourseAccess(
        courseId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Enqueue all lessons via canonical Stage 6 enqueue helper
      const jobs = await Promise.all(
        lessonSpecs.map(spec => {
          const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

          return enqueueStage6Lesson({
            jobData: {
              lessonSpec: spec,
              courseId,
              language: course.language,
              style: (course.style as CourseStyle | null) ?? undefined,
              ragChunks: [],
              ragContextId: null,
            },
            jobName: `lesson:${spec.lesson_id}`,
            source: 'startStage6',
            priority,
            deduplication: { kind: 'jobId', jobId: deduplicationId },
          });
        })
      );

      // Step 3: Log success
      logger.info(
        {
          requestId,
          courseId,
          lessonsEnqueued: jobs.length,
          jobIds: jobs.map(j => j.id),
        },
        'Stage 6 jobs enqueued'
      );

      return {
        success: true,
        jobCount: jobs.length,
        jobIds: jobs.map(j => j.id).filter((id): id is string => id !== undefined),
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
          courseId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Stage 6 start failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start Stage 6 generation',
      });
    }
  });
