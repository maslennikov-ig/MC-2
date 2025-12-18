/**
 * Document Processing tRPC Router
 * @module server/routers/document-processing
 *
 * Provides API endpoints for document processing operations (Stage 2).
 * This router handles retrying failed document processing jobs, similar to
 * how lesson-content.ts handles retrying failed lessons in Stage 6.
 *
 * Procedures:
 * - retryDocument: Retry processing of a single failed document
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership/access is verified before operations
 *
 * @see stages/stage2-document-processing/handler.ts - BullMQ handler
 * @see routers/lesson-content.ts - Similar pattern for Stage 6 retries
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { nanoid } from 'nanoid';
import { addJob } from '../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { deleteVectorsForDocument } from '../../shared/qdrant/lifecycle';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input schema for retryDocument procedure
 */
export const retryDocumentInputSchema = z.object({
  /** Course ID the document belongs to */
  courseId: z.string().uuid('Invalid course ID'),

  /** File ID (document ID) to retry */
  fileId: z.string().uuid('Invalid file ID'),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify user has access to course (course owner or same organization)
 *
 * @param courseId - Course UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Course data if access allowed
 * @throws TRPCError if course not found or access denied
 */
async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{ id: string; user_id: string; organization_id: string }> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.warn({
      requestId,
      courseId,
      userId,
      error,
    }, 'Course not found');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn({
      requestId,
      courseId,
      userId,
      organizationId,
      courseOwnerId: course.user_id,
      courseOrgId: course.organization_id,
    }, 'Course access denied');

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }

  return course;
}

// ============================================================================
// Router Definition
// ============================================================================

/**
 * Document processing router
 *
 * Provides endpoints for document processing operations:
 * - retryDocument: Retry a failed document processing job
 */
export const documentProcessingRouter = router({
  /**
   * Retry processing of a single failed document
   *
   * This endpoint allows retrying document processing for files that failed
   * during Stage 2 (chunking, embedding, Qdrant upload). It verifies the
   * document status is 'failed', resets it to 'pending', and enqueues a new
   * DOCUMENT_PROCESSING job with high priority.
   *
   * Flow:
   * 1. Verify course access (user owns course or same organization)
   * 2. Verify document exists and belongs to the course
   * 3. Verify document status is 'failed' (vector_status = 'failed')
   * 4. Reset document status to 'pending' and clear processed data
   * 5. Enqueue new DOCUMENT_PROCESSING job with high priority
   * 6. Return job ID for tracking
   *
   * Rate Limit: 10 requests per minute (strict limit for retries)
   *
   * @param input.courseId - Course UUID the document belongs to
   * @param input.fileId - File UUID to retry processing
   * @returns { success: true, jobId: string } - Job enqueued successfully
   * @throws NOT_FOUND - Course or document not found
   * @throws FORBIDDEN - User doesn't have access to course
   * @throws BAD_REQUEST - Document status is not 'failed'
   * @throws INTERNAL_SERVER_ERROR - Job enqueue failed
   *
   * @example
   * ```typescript
   * const result = await trpc.documentProcessing.retryDocument.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   fileId: '987fcdeb-51a2-43f7-9c6d-123456789abc',
   * });
   * console.log(`Job enqueued: ${result.jobId}`);
   * ```
   */
  retryDocument: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 retries per minute
    .input(retryDocumentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, fileId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      logger.info({
        requestId,
        courseId,
        fileId,
        userId: currentUser.id,
      }, 'Stage 2 document retry request');

      try {
        const supabase = getSupabaseAdmin();

        // Step 1: Verify course access
        await verifyCourseAccess(
          courseId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        // Step 2: Get file info and verify it belongs to the course
        const { data: file, error: fileError } = await supabase
          .from('file_catalog')
          .select('id, storage_path, mime_type, vector_status, course_id, organization_id')
          .eq('id', fileId)
          .single();

        if (fileError || !file) {
          logger.warn({
            requestId,
            fileId,
            courseId,
            error: fileError,
          }, 'Document not found');

          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Document not found',
          });
        }

        // Step 3: Verify document belongs to the course
        if (file.course_id !== courseId) {
          logger.warn({
            requestId,
            fileId,
            courseId,
            fileCourseId: file.course_id,
          }, 'Document does not belong to course');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Document does not belong to the specified course',
          });
        }

        // Step 4: Verify document status is 'failed'
        if (file.vector_status !== 'failed') {
          logger.warn({
            requestId,
            fileId,
            courseId,
            currentStatus: file.vector_status,
          }, 'Document status is not failed');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Document status is '${file.vector_status}', can only retry 'failed' documents`,
          });
        }

        // Step 5: Delete existing vectors from Qdrant (cleanup before retry)
        await deleteVectorsForDocument(fileId, courseId);

        // Step 6: Reset file status to 'pending' and clear processed data
        const { error: updateError } = await supabase
          .from('file_catalog')
          .update({
            vector_status: 'pending',
            parsed_content: null,
            markdown_content: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fileId);

        if (updateError) {
          logger.error({
            requestId,
            fileId,
            error: updateError,
          }, 'Failed to reset document status');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to reset document status',
          });
        }

        logger.info({
          requestId,
          fileId,
          courseId,
        }, 'Document status reset to pending');

        // Step 7: Enqueue new DOCUMENT_PROCESSING job with high priority
        const jobData: DocumentProcessingJobData = {
          jobType: JobType.DOCUMENT_PROCESSING,
          organizationId: file.organization_id,
          courseId: courseId,
          userId: currentUser.id,
          fileId: fileId,
          filePath: `${process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd()}/${file.storage_path}`,
          mimeType: file.mime_type,
          chunkSize: 512,
          chunkOverlap: 50,
          createdAt: new Date().toISOString(),
        };

        const job = await addJob(
          JobType.DOCUMENT_PROCESSING,
          jobData,
          { priority: 1 } // High priority for retries
        );

        logger.info({
          requestId,
          courseId,
          fileId,
          jobId: job.id,
        }, 'Stage 2 document retry job enqueued');

        return {
          success: true,
          jobId: job.id as string,
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
          fileId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Stage 2 document retry failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry document processing',
        });
      }
    }),
});
