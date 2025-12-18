import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { uploadFileInputSchema } from './_shared/schemas';
import {
  uploadFile as stage1UploadFile,
  isStage1Error,
} from '../../../stages/stage1-document-upload/handler';
import { logger } from '../../../shared/logger/index.js';

/**
 * Upload router for file upload operations
 *
 * Handles file uploads for course materials via Stage 1 Document Upload orchestrator.
 */
export const uploadRouter = router({
  /**
   * Upload a file for a course
   *
   * This endpoint accepts a base64-encoded file and delegates processing to
   * Stage 1 Document Upload orchestrator which handles:
   * - File validation (size, MIME type)
   * - Quota enforcement
   * - File storage
   * - Database record insertion
   */
  uploadFile: instructorProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 uploads per minute
    .input(uploadFileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, filename, fileSize, mimeType, fileContent } = input;

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;

      try {
        // Delegate to Stage 1 Document Upload orchestrator
        // The orchestrator handles: validation, quota, file storage, and DB insert
        const result = await stage1UploadFile({
          courseId,
          organizationId: currentUser.organizationId,
          userId: currentUser.id,
          filename,
          fileSize,
          mimeType,
          fileContent,
        });

        // Return tRPC-compatible response
        return {
          fileId: result.fileId,
          storagePath: result.storagePath,
          message: result.message,
        };
      } catch (error) {
        // Handle Stage 1 execution errors with proper tRPC error codes
        if (isStage1Error(error)) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }

        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            courseId,
            filename,
            userId: currentUser.id,
            organizationId: currentUser.organizationId,
          },
          'Unexpected error in uploadFile'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});
