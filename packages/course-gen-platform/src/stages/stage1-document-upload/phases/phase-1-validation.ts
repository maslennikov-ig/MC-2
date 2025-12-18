/**
 * Phase 1: Input Validation
 *
 * Validates file upload request against tier restrictions:
 * 1. Verify course exists and belongs to user's organization
 * 2. Retrieve organization tier for validation rules
 * 3. Check current file count for course
 * 4. Validate file (size, MIME type, file count) using file-validator
 *
 * Model: None (no LLM invocation - pure validation)
 * Output: Validation result with resolved tier and context
 *
 * @module stages/stage1-document-upload/phases/phase-1-validation
 */

import type { Tier } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { validateFile } from '../../../shared/validation/file-validator';
import { logger } from '../../../shared/logger/index.js';
import type { Stage1Input, Phase1ValidationOutput } from '../types';

/**
 * Validation error codes
 */
export type ValidationErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR';

/**
 * Validation error with user-friendly message
 * Extends Error for proper throw/catch semantics
 */
export class ValidationError extends Error {
  /** Error code for programmatic handling */
  readonly code: ValidationErrorCode;
  /** Suggested tier for upgrade (if applicable) */
  readonly suggestedTier?: Tier;

  constructor(code: ValidationErrorCode, message: string, suggestedTier?: Tier) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.suggestedTier = suggestedTier;
  }
}

/**
 * Phase 1: Validate upload request
 *
 * Performs comprehensive validation of file upload request:
 * - Course ownership verification
 * - Organization tier retrieval
 * - File count check
 * - Tier-based file validation (size, MIME, count limits)
 *
 * @param input - Stage 1 upload input
 * @returns Validation output with tier and context
 * @throws ValidationError if validation fails
 *
 * @example
 * ```typescript
 * const result = await runPhase1Validation(input);
 * if (!result.valid) {
 *   throw new Error('Validation failed');
 * }
 * // Proceed to Phase 2 with result.tier
 * ```
 */
export async function runPhase1Validation(
  input: Stage1Input
): Promise<Phase1ValidationOutput> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  logger.debug(
    {
      courseId: input.courseId,
      filename: input.filename,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    },
    '[Phase 1] Starting upload validation'
  );

  // Step 1: Verify course exists and belongs to user's organization
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, organization_id, title')
    .eq('id', input.courseId)
    .single();

  if (courseError || !course) {
    logger.warn(
      { courseId: input.courseId, error: courseError?.message },
      '[Phase 1] Course not found'
    );
    throw createValidationError('NOT_FOUND', `Course not found: ${input.courseId}`);
  }

  // Verify course belongs to user's organization
  if (course.organization_id !== input.organizationId) {
    logger.warn(
      {
        courseId: input.courseId,
        courseOrgId: course.organization_id,
        userOrgId: input.organizationId,
      },
      '[Phase 1] Organization mismatch - access denied'
    );
    throw createValidationError(
      'FORBIDDEN',
      'You do not have permission to upload files to this course'
    );
  }

  // Step 2: Get organization tier for validation rules
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, tier')
    .eq('id', input.organizationId)
    .single();

  if (orgError || !org) {
    logger.error(
      { organizationId: input.organizationId, error: orgError?.message },
      '[Phase 1] Failed to retrieve organization'
    );
    throw createValidationError(
      'INTERNAL_SERVER_ERROR',
      'Failed to retrieve organization information'
    );
  }

  // Default to 'free' tier if null (defensive)
  const tier: Tier = (org.tier as Tier) || 'free';

  // Step 3: Get current file count for the course
  const { count: currentFileCount, error: countError } = await supabase
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', input.courseId);

  if (countError) {
    logger.error(
      { courseId: input.courseId, error: countError.message },
      '[Phase 1] Failed to count existing files'
    );
    throw createValidationError(
      'INTERNAL_SERVER_ERROR',
      'Failed to check existing file count'
    );
  }

  // Step 4: Validate file with tier-based restrictions
  const validationResult = validateFile(
    {
      filename: input.filename,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    },
    tier,
    currentFileCount || 0
  );

  if (!validationResult.valid) {
    logger.info(
      {
        courseId: input.courseId,
        tier,
        filename: input.filename,
        error: validationResult.error,
      },
      '[Phase 1] File validation failed'
    );
    throw createValidationError(
      'BAD_REQUEST',
      validationResult.userMessage || validationResult.error || 'File validation failed',
      validationResult.suggestedTier
    );
  }

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      courseId: input.courseId,
      tier,
      currentFileCount: currentFileCount || 0,
      durationMs,
    },
    '[Phase 1] Validation passed'
  );

  return {
    valid: true,
    tier,
    courseTitle: course.title || 'Untitled Course',
    currentFileCount: currentFileCount || 0,
    durationMs,
  };
}

/**
 * Create a validation error with consistent structure
 */
function createValidationError(
  code: ValidationErrorCode,
  message: string,
  suggestedTier?: Tier
): ValidationError {
  return new ValidationError(code, message, suggestedTier);
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as ValidationError).code === 'string' &&
    typeof (error as ValidationError).message === 'string'
  );
}
