/**
 * Stage 1: Document Upload Orchestrator
 *
 * Coordinates the document upload pipeline through 2 phases:
 * 1. Validation (course ownership, tier restrictions, file validation)
 * 2. Storage (quota reservation, disk write, database insert)
 *
 * IMPORTANT: Stage 1 is NOT a BullMQ job - it's a synchronous tRPC endpoint.
 * Unlike Stages 2-5, this orchestrator is called directly from the router.
 *
 * @module stages/stage1-document-upload/orchestrator
 */

import { logger } from '../../shared/logger/index.js';
import { runPhase1Validation, runPhase2Storage, isValidationError, isStorageError } from './phases';
import type { Stage1Input, Stage1Output } from './types';

/**
 * Stage 1 execution error codes
 */
export type Stage1ErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR' | 'UNAUTHORIZED';

/**
 * Stage 1 execution error
 * Extends Error for proper throw/catch semantics
 */
export class Stage1ExecutionError extends Error {
  /** tRPC-compatible error code */
  readonly code: Stage1ErrorCode;

  constructor(code: Stage1ErrorCode, message: string) {
    super(message);
    this.name = 'Stage1ExecutionError';
    this.code = code;
  }
}

/**
 * Stage 1 Document Upload Orchestrator
 *
 * Coordinates file upload workflow with comprehensive error handling
 * and automatic rollback on failure.
 *
 * Flow:
 * 1. Phase 1: Validate request (course ownership, tier, file restrictions)
 * 2. Phase 2: Store file (quota, disk, database)
 *
 * On any failure, resources are automatically cleaned up.
 */
export class Stage1Orchestrator {
  /**
   * Execute complete document upload pipeline
   *
   * @param input - Upload request data
   * @returns Upload result with file ID and storage path
   * @throws Stage1ExecutionError if any phase fails
   *
   * @example
   * ```typescript
   * const orchestrator = new Stage1Orchestrator();
   * try {
   *   const result = await orchestrator.execute({
   *     courseId: 'uuid',
   *     organizationId: 'uuid',
   *     userId: 'uuid',
   *     filename: 'document.pdf',
   *     fileSize: 1024000,
   *     mimeType: 'application/pdf',
   *     fileContent: 'base64...',
   *   });
   *   console.log(`File uploaded: ${result.fileId}`);
   * } catch (error) {
   *   // Handle error with error.code and error.message
   * }
   * ```
   */
  async execute(input: Stage1Input): Promise<Stage1Output> {
    const startTime = Date.now();

    logger.info(
      {
        courseId: input.courseId,
        organizationId: input.organizationId,
        filename: input.filename,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
      },
      '[Stage 1] Starting document upload orchestration'
    );

    try {
      // Phase 1: Validation
      const validationResult = await runPhase1Validation(input);

      logger.debug(
        {
          tier: validationResult.tier,
          courseTitle: validationResult.courseTitle,
          currentFileCount: validationResult.currentFileCount,
          durationMs: validationResult.durationMs,
        },
        '[Stage 1] Phase 1 complete: Validation passed'
      );

      // Phase 2: Storage
      const storageResult = await runPhase2Storage(input);

      logger.debug(
        {
          fileId: storageResult.fileId,
          storagePath: storageResult.storagePath,
          actualSize: storageResult.actualSize,
          durationMs: storageResult.durationMs,
        },
        '[Stage 1] Phase 2 complete: File stored'
      );

      // Build output
      const totalDuration = Date.now() - startTime;
      const output: Stage1Output = {
        fileId: storageResult.fileId,
        storagePath: storageResult.storagePath,
        vectorStatus: 'pending',
        fileHash: storageResult.fileHash,
        message: `File "${input.filename}" uploaded successfully to course "${validationResult.courseTitle}"`,
      };

      logger.info(
        {
          fileId: output.fileId,
          storagePath: output.storagePath,
          totalDurationMs: totalDuration,
          phase1DurationMs: validationResult.durationMs,
          phase2DurationMs: storageResult.durationMs,
        },
        '[Stage 1] Document upload orchestration complete'
      );

      return output;
    } catch (error) {
      // Convert phase errors to execution errors
      const executionError = this.convertToExecutionError(error);

      logger.error(
        {
          code: executionError.code,
          message: executionError.message,
          courseId: input.courseId,
          filename: input.filename,
          durationMs: Date.now() - startTime,
        },
        '[Stage 1] Document upload failed'
      );

      throw executionError;
    }
  }

  /**
   * Convert phase errors to execution errors
   */
  private convertToExecutionError(error: unknown): Stage1ExecutionError {
    // Handle validation errors (Phase 1)
    if (isValidationError(error)) {
      return new Stage1ExecutionError(error.code, error.message);
    }

    // Handle storage errors (Phase 2)
    // Note: Rollback is already performed in phase-2-storage
    if (isStorageError(error)) {
      return new Stage1ExecutionError(error.code, error.message);
    }

    // Handle unknown errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Stage1ExecutionError('INTERNAL_SERVER_ERROR', `File upload failed: ${errorMessage}`);
  }
}
