/**
 * Stage 1: Document Upload Handler
 *
 * Exports the main entry point for document upload functionality.
 * This handler is called directly from the tRPC router.
 *
 * IMPORTANT: Stage 1 is NOT a BullMQ job handler - it's a synchronous function.
 * Unlike Stages 2-5 which extend BaseJobHandler, this is a simple function export.
 *
 * Usage:
 * - Import `uploadFile` in the generation router
 * - Call with Stage1Input to upload a document
 * - Returns Stage1Output on success
 * - Throws Stage1ExecutionError on failure
 *
 * @module stages/stage1-document-upload/handler
 */

import { Stage1Orchestrator, type Stage1ExecutionError } from './orchestrator';
import type { Stage1Input, Stage1Output } from './types';

/**
 * Singleton orchestrator instance
 * Reused across all upload requests
 */
const orchestrator = new Stage1Orchestrator();

/**
 * Upload a file to a course
 *
 * Main entry point for Stage 1 document upload.
 * Validates the request and stores the file with comprehensive error handling.
 *
 * @param input - Upload request data
 * @returns Upload result with file ID and storage path
 * @throws Stage1ExecutionError with code and message for tRPC error handling
 *
 * @example
 * ```typescript
 * // In generation router
 * import { uploadFile } from '../../stages/stage1-document-upload/handler';
 *
 * const result = await uploadFile({
 *   courseId: input.courseId,
 *   organizationId: ctx.user.organizationId,
 *   userId: ctx.user.id,
 *   filename: input.filename,
 *   fileSize: input.fileSize,
 *   mimeType: input.mimeType,
 *   fileContent: input.fileContent,
 * });
 *
 * return {
 *   fileId: result.fileId,
 *   storagePath: result.storagePath,
 *   message: result.message,
 * };
 * ```
 */
export async function uploadFile(input: Stage1Input): Promise<Stage1Output> {
  return orchestrator.execute(input);
}

/**
 * Check if an error is a Stage 1 execution error
 * Useful for error handling in the router
 */
export function isStage1Error(error: unknown): error is Stage1ExecutionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as Stage1ExecutionError).code === 'string' &&
    typeof (error as Stage1ExecutionError).message === 'string'
  );
}

// Re-export types for convenience
export type { Stage1Input, Stage1Output } from './types';
export type { Stage1ExecutionError } from './orchestrator';
