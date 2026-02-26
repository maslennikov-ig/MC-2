/**
 * Clarifying Questions Router - Helper Functions
 * @module server/routers/clarifying-helpers
 *
 * Extracted from clarifying.router.ts to keep the router file under 500 code lines
 * and each function under 150 lines / complexity 20.
 *
 * Contains:
 * - Access verification helpers (verifyCourseAccess, verifyQuestionAccess)
 * - submitAnswer validation and persistence helpers
 * - Shared interfaces (CourseRow, CourseDetails)
 *
 * Approve-and-proceed helpers are in clarifying-approval-helpers.ts
 */

import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { ClarifyingQuestionRow, UserAnswerValue, Database } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';
import { throwOnSupabaseError } from '../utils/supabase-query-guard';

// Re-export approve-and-proceed helpers so the router can import from one place
export {
  executeAtomicApproval,
  verifyStatusTransition,
  fetchAnsweredQuestions,
  fetchCourseDetailsForJob,
  fetchDocumentSummaries,
  createAnalysisJob,
} from './clarifying-approval-helpers';

export type { ApprovalRpcResult, CreateAnalysisJobParams } from './clarifying-approval-helpers';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Course row for access verification
 */
export interface CourseRow {
  id: string;
  user_id: string;
  organization_id: string;
  generation_status: string;
}

/**
 * Course details for analysis job
 */
export interface CourseDetails {
  id: string;
  title: string;
  course_description: string | null;
  language: string | null;
  style: string | null;
  target_audience: string | null;
  difficulty: string | null;
  settings: Record<string, unknown> | null;
  organization: { tier?: string } | null;
}

// ============================================================================
// ACCESS VERIFICATION
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
export async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<CourseRow> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, generation_status')
    .eq('id', courseId)
    .single();

  throwOnSupabaseError(error, 'Course', { requestId, courseId, userId });
  if (!course) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn(
      {
        requestId,
        courseId,
        userId,
        organizationId,
        courseOwnerId: course.user_id,
        courseOrgId: course.organization_id,
      },
      'Course access denied'
    );

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }

  return course as CourseRow;
}

/**
 * Verify question belongs to course and user has access
 *
 * @param questionId - Question UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Question data if access allowed
 * @throws TRPCError if question not found or access denied
 */
export async function verifyQuestionAccess(
  questionId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{ question: ClarifyingQuestionRow; course: CourseRow }> {
  const supabase = getSupabaseAdmin();

  // Fetch question
  const { data: question, error } = await supabase
    .from('clarifying_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  throwOnSupabaseError(error, 'Question', { requestId, questionId, userId });
  if (!question) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Question not found',
    });
  }

  // Verify course access
  const course = await verifyCourseAccess(question.course_id, userId, organizationId, requestId);

  return { question: question as ClarifyingQuestionRow, course };
}

/**
 * Get tier-based priority for BullMQ job
 */
export function getTierPriority(tier: string | null): number {
  switch (tier) {
    case 'free':
      return 1;
    case 'basic':
      return 3;
    case 'standard':
      return 5;
    case 'premium':
      return 7;
    case 'enterprise':
      return 10;
    default:
      return 1;
  }
}

// ============================================================================
// SUBMIT ANSWER HELPERS
// ============================================================================

/**
 * Validate that answer fields match the question type (open/single_choice vs multi_choice)
 *
 * @throws TRPCError if answer/answers field doesn't match question type
 */
export function validateAnswerForQuestionType(
  questionType: string,
  answer: string | undefined,
  answers: string[] | undefined
): void {
  const isMultiChoice = questionType === 'multi_choice';
  if (isMultiChoice) {
    if (!answers || answers.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'answers array is required for multi_choice questions',
      });
    }
  } else {
    if (!answer) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'answer is required for open/single_choice questions',
      });
    }
  }
}

/**
 * Validate answer source requirements and resolve effective source.
 * For 'suggested' mode: requires selectedSuggestionIndex(es).
 * For 'modified' mode: auto-corrects to 'custom' for multi_choice if no indexes.
 * For 'custom' mode: rejects if selectedSuggestionIndex is present.
 *
 * @returns The effective answer source (may differ from input if auto-corrected)
 * @throws TRPCError on invalid source/field combinations
 */
export function validateAnswerSource(
  answerSource: string,
  questionType: string,
  selectedSuggestionIndex: number | undefined,
  selectedSuggestionIndexes: number[] | undefined,
  userModification: string | undefined,
  questionId: string
): string {
  const isMultiChoice = questionType === 'multi_choice';
  let effectiveSource = answerSource;

  if (answerSource === 'suggested') {
    if (isMultiChoice) {
      if (!selectedSuggestionIndexes || selectedSuggestionIndexes.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'selectedSuggestionIndexes is required for suggested multi_choice answers',
        });
      }
    } else if (selectedSuggestionIndex === undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'selectedSuggestionIndex is required for suggested answers',
      });
    }
  }

  if (answerSource === 'modified') {
    if (isMultiChoice) {
      if (!selectedSuggestionIndexes || selectedSuggestionIndexes.length === 0) {
        effectiveSource = 'custom';
        logger.info(
          { questionId, originalSource: 'modified', correctedSource: 'custom' },
          'Auto-corrected answerSource: modified -> custom (no suggestions selected)'
        );
      }
    } else {
      if (selectedSuggestionIndex === undefined || !userModification) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'selectedSuggestionIndex and userModification are required for modified answers',
        });
      }
    }
  }

  if (effectiveSource === 'custom' && selectedSuggestionIndex !== undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Custom answers should not include selectedSuggestionIndex',
    });
  }

  return effectiveSource;
}

/**
 * Validate that suggestion indexes are within bounds and have no duplicates.
 * HIGH-001 fix: prevents out-of-bounds and duplicate indexes.
 *
 * @throws TRPCError if any index is invalid or duplicated
 */
export function validateSuggestionIndexes(
  suggestions: unknown[],
  selectedSuggestionIndex: number | undefined,
  selectedSuggestionIndexes: number[] | undefined
): void {
  if (selectedSuggestionIndex !== undefined) {
    if (selectedSuggestionIndex >= suggestions.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid suggestion index',
      });
    }
  }

  if (selectedSuggestionIndexes) {
    for (const idx of selectedSuggestionIndexes) {
      if (idx >= suggestions.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid suggestion index: ${idx}`,
        });
      }
    }

    if (new Set(selectedSuggestionIndexes).size !== selectedSuggestionIndexes.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Duplicate selections detected',
      });
    }

    if (selectedSuggestionIndexes.length > suggestions.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot select more than ${suggestions.length} options`,
      });
    }
  }
}

/** Parameters for persisting an answer to the database */
export interface PersistAnswerParams {
  questionId: string;
  isMultiChoice: boolean;
  answer: string | undefined;
  answers: string[] | undefined;
  effectiveAnswerSource: string;
  selectedSuggestionIndex: number | undefined;
  selectedSuggestionIndexes: number[] | undefined;
  userModification: string | undefined;
  questionMetadata: unknown;
  requestId: string;
}

/**
 * Persist the answer to the clarifying_questions table.
 *
 * @throws TRPCError if the DB update fails
 */
export async function persistAnswer(params: PersistAnswerParams): Promise<void> {
  const supabase = getSupabaseAdmin();

  const userAnswerValue: UserAnswerValue = params.isMultiChoice
    ? { values: params.answers }
    : { value: params.answer };

  // Note: Cast to unknown needed because database.types.ts incorrectly types
  // user_answer as string instead of JSONB. The actual column is JSONB.
  const { error: updateError } = await supabase
    .from('clarifying_questions')
    .update({
      user_answer: userAnswerValue as unknown as string,
      answer_source: params.effectiveAnswerSource,
      selected_suggestion_index: params.isMultiChoice
        ? null
        : (params.selectedSuggestionIndex ?? null),
      user_modification: params.userModification ?? null,
      status: 'answered',
      answered_at: new Date().toISOString(),
      // Store multi_choice indexes in metadata
      metadata:
        params.isMultiChoice && params.selectedSuggestionIndexes
          ? ({
              selected_suggestion_indexes: params.selectedSuggestionIndexes,
            } as unknown as Database['public']['Tables']['clarifying_questions']['Update']['metadata'])
          : (params.questionMetadata as Database['public']['Tables']['clarifying_questions']['Update']['metadata']),
    })
    .eq('id', params.questionId);

  if (updateError) {
    logger.error(
      { requestId: params.requestId, questionId: params.questionId, error: updateError.message },
      'Failed to update question'
    );

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to submit answer',
    });
  }
}

/**
 * Check if all critical/important questions for a course are answered.
 *
 * @returns true if the user can proceed (no remaining required questions)
 */
export async function checkCanProceed(courseId: string, requestId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data: remainingRequired, error: checkError } = await supabase
    .from('clarifying_questions')
    .select('id')
    .eq('course_id', courseId)
    .in('question_priority', ['critical', 'important'])
    .eq('status', 'pending');

  if (checkError) {
    logger.warn(
      { requestId, courseId, error: checkError.message },
      'Failed to check remaining required questions'
    );
  }

  return !remainingRequired || remainingRequired.length === 0;
}
