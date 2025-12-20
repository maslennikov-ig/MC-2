/**
 * Retry Lesson Procedure
 * @module server/routers/lesson-content/procedures/retry-lesson
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { retryLessonInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { addJob } from '../../../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { LessonContentJobData } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Retry a failed lesson
 *
 * Purpose: Re-enqueues a failed lesson for generation with high priority.
 * Useful for recovering from transient failures or after fixing issues.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: ID of the lesson to retry
 * - lessonSpec: Updated lesson specification
 *
 * Output:
 * - success: Boolean success flag
 * - jobId: New BullMQ job ID
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Queue error -> 500 INTERNAL_SERVER_ERROR
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.retryLesson.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonId: '1.1',
 *   lessonSpec: updatedSpec,
 * });
 * // { success: true, jobId: 'job_retry_123' }
 * ```
 */
export const retryLesson = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 retries per minute
  .input(retryLessonInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonId, lessonSpec } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    logger.info({
      requestId,
      courseId,
      lessonId,
      userId: currentUser.id,
    }, 'Stage 6 retry request');

    try {
      // Step 1: Verify course access and get course language
      const course = await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Enqueue with high priority for retries
      const jobData: LessonContentJobData = {
        organizationId: currentUser.organizationId,
        courseId,
        userId: currentUser.id,
        jobType: JobType.LESSON_CONTENT,
        createdAt: new Date().toISOString(),
        lessonSpec,
        ragChunks: [], // Deprecated: RAG chunks are now fetched by handler via retrieveLessonContext()
        ragContextId: null,
        language: course.language, // Pass course language for content generation
      };

      // Unique deduplication ID for retries (includes timestamp)
      // Format: stage6:retry:{courseId}:{lessonId}:{timestamp}
      // This ensures retries are never deduplicated
      const deduplicationId = `stage6:retry:${courseId}:${lessonId}:${Date.now()}`;

      const job = await addJob(JobType.LESSON_CONTENT, jobData, {
        priority: 1, // High priority for retries
        deduplication: {
          id: deduplicationId,
          ttl: 150000, // 2.5 minutes - half of job timeout to allow faster retries
        },
      });

      logger.info({
        requestId,
        courseId,
        lessonId,
        jobId: job.id,
      }, 'Stage 6 retry job enqueued');

      return {
        success: true,
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
        courseId,
        lessonId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Stage 6 retry failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retry lesson generation',
      });
    }
  });
