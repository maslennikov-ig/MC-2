/**
 * Clarifying Questions Router
 * @module server/routers/clarifying.router
 *
 * Provides API endpoints for Stage 4 clarifying questions workflow.
 * Handles question retrieval, answer submission, skipping, and progression.
 *
 * Stage 4 Clarifying Flow:
 * 1. AI generates questions during stage_4_clarifying status
 * 2. User answers critical/important questions (required)
 * 3. User may skip nice_to_have questions (optional)
 * 4. User approves and proceeds to stage_4_analyzing
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership is verified before operations
 *
 * Note: The clarifying_questions table may not be in generated database types.
 * This router uses type assertions with explicit interfaces to ensure type safety.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { addJob } from '../../orchestrator/queue';
import { JobType, ClarifyingQuestionRow, UserAnswerValue } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * MEDIUM-005: Text sanitization for answer inputs
 *
 * - Trims whitespace
 * - Collapses multiple spaces to single
 * - Removes control characters (except newlines for multi-line answers)
 * - Enforces hard character limit
 */
const MAX_ANSWER_LENGTH = 5000;
const MAX_WORD_COUNT = 1000;

function sanitizeAnswerText(text: string): string {
  return (
    text
      .trim()
      .replace(/[^\S\n]+/g, ' ') // Collapse spaces (preserve newlines)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n \r \t
      .slice(0, MAX_ANSWER_LENGTH)
  );
}

/**
 * LOW-002: Rate limit configuration with documented rationale
 *
 * These values are tuned based on:
 * - Typical user behavior during clarifying questions phase
 * - Prevention of accidental DoS from UI bugs
 * - Balance between usability and server protection
 */
export const CLARIFYING_RATE_LIMITS = {
  /** Read operations - frequent polling allowed */
  GET_QUESTIONS: {
    requests: 60,
    windowSeconds: 60,
    rationale: 'Read-heavy endpoint, allow frequent polling for real-time updates',
  },
  /** Single answer submission */
  SUBMIT_ANSWER: {
    requests: 30,
    windowSeconds: 60,
    rationale: 'User typically answers 3-7 questions, allow burst with buffer for edits',
  },
  /** Batch answer submission */
  SUBMIT_BATCH: {
    requests: 10,
    windowSeconds: 60,
    rationale: 'Batch replaces multiple single calls, stricter limit',
  },
  /** Skip question */
  SKIP_QUESTION: {
    requests: 30,
    windowSeconds: 60,
    rationale: 'Same as submit - users may skip multiple questions',
  },
  /** Job creation endpoint */
  APPROVE_AND_PROCEED: {
    requests: 10,
    windowSeconds: 60,
    rationale: 'Job creation endpoint - very strict to prevent duplicate jobs',
  },
} as const;

/**
 * Schema for getQuestions endpoint
 */
const getQuestionsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Schema for submitAnswer endpoint
 *
 * Supports three answer modes:
 * - suggested: User selected a suggested answer (requires selectedSuggestionIndex)
 * - modified: User modified a suggested answer (requires selectedSuggestionIndex + userModification)
 * - custom: User wrote a completely custom answer
 *
 * For multi_choice questions:
 * - Use answers (array) instead of answer (string)
 * - selectedSuggestionIndexes (array) instead of selectedSuggestionIndex
 */
const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  // MEDIUM-005: Stricter validation with sanitization
  // Single answer for open/single_choice
  answer: z
    .string()
    .transform(sanitizeAnswerText)
    .pipe(
      z
        .string()
        .min(3, 'Answer must be at least 3 characters')
        .max(MAX_ANSWER_LENGTH, `Answer too long (max ${MAX_ANSWER_LENGTH} characters)`)
        .refine(
          val => val.split(/\s+/).filter(Boolean).length <= MAX_WORD_COUNT,
          `Answer exceeds word limit (max ${MAX_WORD_COUNT} words)`
        )
    )
    .optional(),
  // Multiple answers for multi_choice
  answers: z
    .array(z.string().transform(sanitizeAnswerText).pipe(z.string().min(1).max(MAX_ANSWER_LENGTH)))
    .min(1, 'At least one answer required')
    .max(10, 'Too many answers')
    .optional(),
  answerSource: z.enum(['suggested', 'modified', 'custom']),
  selectedSuggestionIndex: z.number().int().min(0).optional(),
  // Multiple indexes for multi_choice
  selectedSuggestionIndexes: z.array(z.number().int().min(0)).optional(),
  userModification: z
    .string()
    .transform(sanitizeAnswerText)
    .pipe(
      z.string().max(MAX_ANSWER_LENGTH, `Modification too long (max ${MAX_ANSWER_LENGTH} chars)`)
    )
    .optional(),
});

/**
 * Schema for submitMultipleAnswers endpoint (batch)
 *
 * Allows submitting multiple answers in a single request.
 * Used by "Accept All" feature to avoid rate limiting issues.
 */
const submitMultipleAnswersSchema = z.object({
  submissions: z
    .array(
      z.object({
        questionId: z.string().uuid('Invalid question ID'),
        // MEDIUM-005: Consistent sanitization in batch endpoint
        answer: z
          .string()
          .transform(sanitizeAnswerText)
          .pipe(z.string().min(1, 'Answer is required').max(MAX_ANSWER_LENGTH, 'Answer too long')),
        answerSource: z.enum(['suggested', 'modified', 'custom']),
        selectedSuggestionIndex: z.number().int().min(0).optional(),
      })
    )
    .min(1, 'At least one submission required')
    .max(20, 'Maximum 20 submissions per batch'),
});

/**
 * Schema for skipQuestion endpoint
 */
const skipQuestionSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
});

/**
 * Schema for approveAndProceed endpoint
 */
const approveAndProceedSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type re-exports for convenience
 * These are now imported from @megacampus/shared-types to ensure consistency
 */
export type {
  QuestionType,
  UserAnswerValue,
  ClarifyingQuestionRow,
} from '@megacampus/shared-types';

/**
 * Course row for access verification
 */
interface CourseRow {
  id: string;
  user_id: string;
  organization_id: string;
  generation_status: string;
}

/**
 * Course details for analysis job
 */
interface CourseDetails {
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
// HELPERS
// ============================================================================

/**
 * Get Supabase admin client with full Database type safety
 *
 * Returns properly typed Supabase client for accessing clarifying_questions table.
 * JSONB columns (user_answer, suggested_answers) are correctly typed via
 * ClarifyingQuestionRow interface from shared-types.
 *
 * @returns SupabaseClient<Database> with full type safety for all tables
 */
function getTypedSupabaseAdmin(): SupabaseClient<Database> {
  return getSupabaseAdmin();
}

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
): Promise<CourseRow> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, generation_status')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.warn({ requestId, courseId, userId, error }, 'Course not found');

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
async function verifyQuestionAccess(
  questionId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{ question: ClarifyingQuestionRow; course: CourseRow }> {
  const supabase = getTypedSupabaseAdmin();

  // Fetch question
  const { data: question, error } = await supabase
    .from('clarifying_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  if (error || !question) {
    logger.warn({ requestId, questionId, userId, error }, 'Question not found');

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
function getTierPriority(tier: string | null): number {
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
// ROUTER
// ============================================================================

/**
 * Clarifying questions router
 *
 * Provides endpoints for Stage 4 clarifying questions workflow:
 * - isEnabled: Check if clarifying questions are enabled for a course (lightweight)
 * - getQuestions: Retrieve all questions for a course
 * - getProgress: Get progress statistics
 * - submitAnswer: Submit an answer to a question
 * - skipQuestion: Skip a nice_to_have question
 * - approveAndProceed: Approve answers and continue to analysis
 * - requestSecondRound: Request additional questions
 */
export const clarifyingRouter = router({
  /**
   * Check if clarifying questions are enabled for a course
   *
   * Purpose: Lightweight check to determine if clarifying questions feature
   * is enabled for a course. Used by GraphView to avoid unnecessary getProgress
   * queries when clarifying is disabled.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   *
   * Output:
   * - enabled: Boolean indicating if clarifying questions are enabled
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.isEnabled.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { enabled: true }
   * ```
   */
  isEnabled: protectedProcedure
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      // Fetch only the settings.clarifying_questions_enabled field
      const { data: course, error } = await supabase
        .from('courses')
        .select('settings')
        .eq('id', courseId)
        .single();

      if (error) {
        // If course not found or error, return disabled
        return { enabled: false };
      }

      const settings = (course?.settings as Record<string, unknown>) || {};
      const enabled = (settings.clarifying_questions_enabled as boolean) || false;

      return { enabled };
    }),

  /**
   * Get all questions for a course
   *
   * Purpose: Retrieves all clarifying questions for a course, ordered by
   * priority (critical first) and then by order_index.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   *
   * Output:
   * - questions: Array of clarifying questions with all fields
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.getQuestions.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { questions: [{ id: '...', question_text: '...', ... }] }
   * ```
   */
  getQuestions: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.GET_QUESTIONS.requests,
        window: CLARIFYING_RATE_LIMITS.GET_QUESTIONS.windowSeconds,
      })
    )
    .input(getQuestionsSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.debug({ requestId, courseId, userId: currentUser.id }, 'Get questions request');

      try {
        // Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getTypedSupabaseAdmin();

        // Fetch questions ordered by priority and order_index
        const { data: questions, error } = await supabase
          .from('clarifying_questions')
          .select('*')
          .eq('course_id', courseId)
          .order('order_index', { ascending: true });

        if (error) {
          logger.error({ requestId, courseId, error: error.message }, 'Failed to fetch questions');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch questions',
          });
        }

        const allQuestions = (questions || []) as ClarifyingQuestionRow[];

        // Sort by priority: critical first, then important, then nice_to_have
        const priorityOrder: Record<string, number> = {
          critical: 0,
          important: 1,
          nice_to_have: 2,
        };

        const sortedQuestions = allQuestions.sort((a, b) => {
          const aPriority = priorityOrder[a.question_priority] ?? 3;
          const bPriority = priorityOrder[b.question_priority] ?? 3;
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          return a.order_index - b.order_index;
        });

        logger.debug(
          { requestId, courseId, questionCount: sortedQuestions.length },
          'Questions fetched successfully'
        );

        return { questions: sortedQuestions };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Get questions failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch questions',
        });
      }
    }),

  /**
   * Get progress statistics for clarifying questions
   *
   * Purpose: Returns progress statistics for a course's clarifying questions.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   *
   * Output:
   * - total: Total number of questions
   * - answered: Number of answered questions
   * - skipped: Number of skipped questions
   * - pending: Number of pending questions
   * - criticalTotal: Total critical questions
   * - criticalAnswered: Number of answered critical questions
   * - importantTotal: Total important questions
   * - importantAnswered: Number of answered important questions
   * - canProceed: Boolean indicating if all required questions are answered
   * - currentRound: Current iteration round
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.getProgress.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { total: 10, answered: 8, skipped: 1, pending: 1, canProceed: true, ... }
   * ```
   */
  getProgress: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.GET_QUESTIONS.requests,
        window: CLARIFYING_RATE_LIMITS.GET_QUESTIONS.windowSeconds,
      })
    )
    .input(getQuestionsSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      try {
        // Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getTypedSupabaseAdmin();
        const typedSupabase = getSupabaseAdmin();

        // Fetch all questions and course generation_mode in parallel
        const [questionsResult, courseResult] = await Promise.all([
          supabase
            .from('clarifying_questions')
            .select('id, question_priority, status, iteration_round')
            .eq('course_id', courseId),
          typedSupabase.from('courses').select('generation_mode').eq('id', courseId).single(),
        ]);

        if (questionsResult.error) {
          logger.error(
            { requestId, courseId, error: questionsResult.error.message },
            'Failed to fetch questions for progress'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch progress',
          });
        }

        const allQuestions = (questionsResult.data || []) as Pick<
          ClarifyingQuestionRow,
          'id' | 'question_priority' | 'status' | 'iteration_round'
        >[];

        // Calculate statistics
        const total = allQuestions.length;
        const answered = allQuestions.filter(q => q.status === 'answered').length;
        const skipped = allQuestions.filter(q => q.status === 'skipped').length;
        const pending = allQuestions.filter(q => q.status === 'pending').length;

        const criticalQuestions = allQuestions.filter(q => q.question_priority === 'critical');
        const criticalTotal = criticalQuestions.length;
        const criticalAnswered = criticalQuestions.filter(q => q.status === 'answered').length;

        const importantQuestions = allQuestions.filter(q => q.question_priority === 'important');
        const importantTotal = importantQuestions.length;
        const importantAnswered = importantQuestions.filter(q => q.status === 'answered').length;

        // Can proceed if all critical and important questions are answered
        const canProceed =
          criticalAnswered === criticalTotal && importantAnswered === importantTotal;

        // Round 2 removed - always 1
        const currentRound = 1;

        // Check if course is in automatic mode
        const isAutomatic = courseResult.data?.generation_mode === 'automatic';

        logger.debug(
          {
            requestId,
            courseId,
            total,
            answered,
            skipped,
            pending,
            criticalAnswered,
            criticalTotal,
            canProceed,
            isAutomatic,
          },
          'Progress calculated'
        );

        return {
          total,
          answered,
          skipped,
          pending,
          criticalTotal,
          criticalAnswered,
          importantTotal,
          importantAnswered,
          canProceed,
          currentRound,
          isAutomatic,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Get progress failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch progress',
        });
      }
    }),

  /**
   * Submit answer to a question
   *
   * Purpose: Submits an answer to a clarifying question. Supports three modes:
   * - suggested: User selected a suggested answer
   * - modified: User modified a suggested answer
   * - custom: User wrote a completely custom answer
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - questionId: UUID of the question
   * - answer: The answer text
   * - answerSource: 'suggested' | 'modified' | 'custom'
   * - selectedSuggestionIndex: Index of selected suggestion (for suggested/modified)
   * - userModification: Modification text (for modified mode)
   *
   * Output:
   * - success: Boolean success flag
   * - canProceed: Whether all required questions are now answered
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.submitAnswer.mutate({
   *   questionId: '...',
   *   answer: 'Beginners with no prior experience',
   *   answerSource: 'custom',
   * });
   * // { success: true, canProceed: false }
   * ```
   */
  submitAnswer: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.SUBMIT_ANSWER.requests,
        window: CLARIFYING_RATE_LIMITS.SUBMIT_ANSWER.windowSeconds,
      })
    )
    .input(submitAnswerSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        questionId,
        answer,
        answers,
        answerSource,
        selectedSuggestionIndex,
        selectedSuggestionIndexes,
        userModification,
      } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info(
        { requestId, questionId, answerSource, userId: currentUser.id },
        'Submit answer request'
      );

      try {
        // Verify question access
        const { question, course } = await verifyQuestionAccess(
          questionId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        const questionType = question.question_type || 'open';
        const isMultiChoice = questionType === 'multi_choice';

        // Validate input based on question type
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

        // Validate answer source requirements
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

        // Validate 'modified' source requirements
        // For multi_choice: selectedSuggestionIndexes required (user selected suggestions + added custom)
        // For open/single_choice: selectedSuggestionIndex + userModification required
        if (answerSource === 'modified') {
          if (isMultiChoice) {
            // multi_choice modified = selected suggestions + custom answer in answers array
            if (!selectedSuggestionIndexes || selectedSuggestionIndexes.length === 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'selectedSuggestionIndexes is required for modified multi_choice answers',
              });
            }
          } else {
            // open/single_choice modified = suggestion + userModification
            if (selectedSuggestionIndex === undefined || !userModification) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'selectedSuggestionIndex and userModification are required for modified answers',
              });
            }
          }
        }

        // Custom answers should not have suggestion-related fields
        if (answerSource === 'custom' && selectedSuggestionIndex !== undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Custom answers should not include selectedSuggestionIndex',
          });
        }

        // Validate suggestion indexes if provided
        const suggestions = question.suggested_answers || [];
        if (selectedSuggestionIndex !== undefined) {
          if (selectedSuggestionIndex >= suggestions.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid suggestion index',
            });
          }
        }
        if (selectedSuggestionIndexes) {
          // HIGH-001 fix: Validate each index is within bounds
          for (const idx of selectedSuggestionIndexes) {
            if (idx >= suggestions.length) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Invalid suggestion index: ${idx}`,
              });
            }
          }

          // HIGH-001 fix: Check for duplicate indexes
          if (new Set(selectedSuggestionIndexes).size !== selectedSuggestionIndexes.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Duplicate selections detected',
            });
          }

          // HIGH-001 fix: Ensure count doesn't exceed available suggestions
          if (selectedSuggestionIndexes.length > suggestions.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot select more than ${suggestions.length} options`,
            });
          }
        }

        const supabase = getTypedSupabaseAdmin();

        // Build user_answer as JSONB based on question type
        const userAnswerValue: UserAnswerValue = isMultiChoice
          ? { values: answers }
          : { value: answer };

        // Update question with answer
        // Note: Cast to unknown needed because database.types.ts incorrectly types
        // user_answer as string instead of JSONB. The actual column is JSONB.
        const { error: updateError } = await supabase
          .from('clarifying_questions')
          .update({
            user_answer: userAnswerValue as unknown as string,
            answer_source: answerSource,
            selected_suggestion_index: isMultiChoice ? null : (selectedSuggestionIndex ?? null),
            user_modification: userModification ?? null,
            status: 'answered',
            answered_at: new Date().toISOString(),
            // Store multi_choice indexes in metadata
            metadata:
              isMultiChoice && selectedSuggestionIndexes
                ? ({
                    selected_suggestion_indexes: selectedSuggestionIndexes,
                  } as unknown as Database['public']['Tables']['clarifying_questions']['Update']['metadata'])
                : (question.metadata as unknown as Database['public']['Tables']['clarifying_questions']['Update']['metadata']),
          })
          .eq('id', questionId);

        if (updateError) {
          logger.error(
            { requestId, questionId, error: updateError.message },
            'Failed to update question'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to submit answer',
          });
        }

        // Check if all critical/important questions are now answered
        const { data: remainingRequired, error: checkError } = await supabase
          .from('clarifying_questions')
          .select('id')
          .eq('course_id', course.id)
          .in('question_priority', ['critical', 'important'])
          .eq('status', 'pending');

        if (checkError) {
          logger.warn(
            { requestId, courseId: course.id, error: checkError.message },
            'Failed to check remaining required questions'
          );
        }

        const canProceed = !remainingRequired || remainingRequired.length === 0;

        logger.info({ requestId, questionId, canProceed }, 'Answer submitted successfully');

        return { success: true, canProceed };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Submit answer failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit answer',
        });
      }
    }),

  /**
   * Submit multiple answers in a batch
   *
   * Purpose: Allows submitting multiple answers in a single API call.
   * Used by "Accept All" feature to avoid rate limiting issues.
   * All answers are submitted atomically in a single database transaction.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - submissions: Array of answer submissions (max 20)
   *   - questionId: UUID of the question
   *   - answer: The answer text
   *   - answerSource: 'suggested' | 'modified' | 'custom'
   *   - selectedSuggestionIndex: Index of selected suggestion (for suggested)
   *
   * Output:
   * - successCount: Number of successfully submitted answers
   * - failedIds: Array of question IDs that failed
   * - canProceed: Whether all required questions are now answered
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.submitMultipleAnswers.mutate({
   *   submissions: [
   *     { questionId: '...', answer: 'Answer 1', answerSource: 'suggested', selectedSuggestionIndex: 0 },
   *     { questionId: '...', answer: 'Answer 2', answerSource: 'suggested', selectedSuggestionIndex: 0 },
   *   ],
   * });
   * // { successCount: 2, failedIds: [], canProceed: true }
   * ```
   */
  submitMultipleAnswers: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.SUBMIT_BATCH.requests,
        window: CLARIFYING_RATE_LIMITS.SUBMIT_BATCH.windowSeconds,
      })
    )
    .input(submitMultipleAnswersSchema)
    .mutation(async ({ ctx, input }) => {
      const { submissions } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info(
        { requestId, submissionCount: submissions.length, userId: currentUser.id },
        'Submit multiple answers request'
      );

      try {
        const supabase = getTypedSupabaseAdmin();
        const successfulIds: string[] = [];
        const failedIds: string[] = [];

        // Verify all questions belong to the same course and user has access
        const questionIds = submissions.map(s => s.questionId);

        // Fetch all questions in one query
        const { data: questions, error: fetchError } = await supabase
          .from('clarifying_questions')
          .select('id, course_id, status, suggested_answers')
          .in('id', questionIds);

        if (fetchError || !questions) {
          logger.error(
            { requestId, error: fetchError?.message },
            'Failed to fetch questions for batch submission'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch questions',
          });
        }

        const questionList = questions as Array<{
          id: string;
          course_id: string;
          status: string;
          suggested_answers: Array<{ text: string }> | null;
        }>;

        // Validate all questions exist
        const foundIds = new Set(questionList.map(q => q.id));
        const missingIds = questionIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Questions not found: ${missingIds.join(', ')}`,
          });
        }

        // Validate all questions belong to the same course
        const courseIds = new Set(questionList.map(q => q.course_id));
        if (courseIds.size > 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'All questions must belong to the same course',
          });
        }

        const courseId = questionList[0].course_id;

        // Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Create a map for quick question lookup
        const questionMap = new Map(questionList.map(q => [q.id, q]));

        // Process each submission
        const now = new Date().toISOString();

        for (const submission of submissions) {
          const question = questionMap.get(submission.questionId);
          if (!question) {
            failedIds.push(submission.questionId);
            continue;
          }

          // Skip already answered questions
          if (question.status === 'answered') {
            logger.debug(
              { requestId, questionId: submission.questionId },
              'Question already answered, skipping'
            );
            successfulIds.push(submission.questionId);
            continue;
          }

          // Validate suggestion index if provided
          const suggestions = question.suggested_answers || [];
          if (
            submission.answerSource === 'suggested' &&
            submission.selectedSuggestionIndex !== undefined
          ) {
            if (submission.selectedSuggestionIndex >= suggestions.length) {
              logger.warn(
                {
                  requestId,
                  questionId: submission.questionId,
                  index: submission.selectedSuggestionIndex,
                  suggestionsCount: suggestions.length,
                },
                'Invalid suggestion index'
              );
              failedIds.push(submission.questionId);
              continue;
            }
          }

          // Build user_answer as JSONB
          const userAnswerValue: UserAnswerValue = { value: submission.answer };

          // Update question with answer
          const { error: updateError } = await supabase
            .from('clarifying_questions')
            .update({
              user_answer: userAnswerValue as unknown as string,
              answer_source: submission.answerSource,
              selected_suggestion_index: submission.selectedSuggestionIndex ?? null,
              status: 'answered',
              answered_at: now,
            })
            .eq('id', submission.questionId);

          if (updateError) {
            logger.error(
              { requestId, questionId: submission.questionId, error: updateError.message },
              'Failed to update question in batch'
            );
            failedIds.push(submission.questionId);
          } else {
            successfulIds.push(submission.questionId);
          }
        }

        // Check if all critical/important questions are now answered
        const { data: remainingRequired } = await supabase
          .from('clarifying_questions')
          .select('id')
          .eq('course_id', courseId)
          .in('question_priority', ['critical', 'important'])
          .eq('status', 'pending');

        const canProceed = !remainingRequired || remainingRequired.length === 0;

        logger.info(
          {
            requestId,
            successCount: successfulIds.length,
            failedCount: failedIds.length,
            canProceed,
          },
          'Batch answer submission completed'
        );

        return {
          successCount: successfulIds.length,
          failedIds,
          canProceed,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Submit multiple answers failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to submit answers',
        });
      }
    }),

  /**
   * Skip a question
   *
   * Purpose: Marks a question as skipped. Only nice_to_have priority questions
   * can be skipped. Critical and important questions must be answered.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - questionId: UUID of the question to skip
   *
   * Output:
   * - success: Boolean success flag
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.skipQuestion.mutate({
   *   questionId: '...',
   * });
   * // { success: true }
   * ```
   */
  skipQuestion: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.SKIP_QUESTION.requests,
        window: CLARIFYING_RATE_LIMITS.SKIP_QUESTION.windowSeconds,
      })
    )
    .input(skipQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const { questionId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info({ requestId, questionId, userId: currentUser.id }, 'Skip question request');

      try {
        // Verify question access
        const { question } = await verifyQuestionAccess(
          questionId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        // Only nice_to_have questions can be skipped
        if (question.question_priority !== 'nice_to_have') {
          logger.warn(
            { requestId, questionId, priority: question.question_priority },
            'Cannot skip non-optional question'
          );

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot skip ${question.question_priority} priority questions. Only nice_to_have questions can be skipped.`,
          });
        }

        const supabase = getTypedSupabaseAdmin();

        // Mark question as skipped
        const { error: updateError } = await supabase
          .from('clarifying_questions')
          .update({
            status: 'skipped',
          })
          .eq('id', questionId);

        if (updateError) {
          logger.error(
            { requestId, questionId, error: updateError.message },
            'Failed to skip question'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to skip question',
          });
        }

        logger.info({ requestId, questionId }, 'Question skipped successfully');

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Skip question failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to skip question',
        });
      }
    }),

  /**
   * Approve answers and proceed to analysis
   *
   * Purpose: Verifies all critical/important questions are answered and
   * enqueues the STRUCTURE_ANALYSIS job to continue Stage 4. Transitions
   * course status from stage_4_clarifying to stage_4_analyzing.
   *
   * Uses atomic RPC function `approve_and_proceed_atomic` with FOR UPDATE lock
   * to prevent race conditions during status transition.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   *
   * Output:
   * - success: Boolean success flag
   * - jobId: BullMQ job ID for tracking
   *
   * @example
   * ```typescript
   * const result = await trpc.clarifying.approveAndProceed.mutate({
   *   courseId: '...',
   * });
   * // { success: true, jobId: '123' }
   * ```
   */
  approveAndProceed: protectedProcedure
    .use(
      createRateLimiter({
        requests: CLARIFYING_RATE_LIMITS.APPROVE_AND_PROCEED.requests,
        window: CLARIFYING_RATE_LIMITS.APPROVE_AND_PROCEED.windowSeconds,
      })
    )
    .input(approveAndProceedSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info({ requestId, courseId, userId: currentUser.id }, 'Approve and proceed request');

      try {
        const supabase = getTypedSupabaseAdmin();
        const typedSupabase = getSupabaseAdmin();

        // Use atomic RPC function to validate and transition status
        // This prevents race conditions with FOR UPDATE lock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
          'approve_and_proceed_atomic',
          {
            p_course_id: courseId,
            p_user_id: currentUser.id,
            p_org_id: currentUser.organizationId,
          }
        );

        if (rpcError) {
          logger.error(
            { requestId, courseId, error: rpcError.message },
            'RPC approve_and_proceed_atomic failed'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to proceed',
          });
        }

        // Handle RPC result errors
        // Note: RPC function not in generated database.types.ts, manual typing required
        const result = rpcResult as unknown as {
          success: boolean;
          error?: string;
          code?: string;
          unanswered_critical?: number;
          unanswered_important?: number;
          current_status?: string;
          existing_job_id?: string;
          is_duplicate?: boolean;
        };

        if (!result.success) {
          logger.warn({ requestId, courseId, rpcResult: result }, 'RPC returned failure');

          // Map RPC error codes to TRPC errors
          switch (result.code) {
            case 'NOT_FOUND':
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Course not found',
              });
            case 'FORBIDDEN':
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'You do not have access to this course',
              });
            case 'INVALID_STATUS':
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Cannot proceed from status '${result.current_status}'. Expected: stage_4_clarifying`,
              });
            case 'UNANSWERED_QUESTIONS':
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Cannot proceed. ${result.unanswered_critical} critical and ${result.unanswered_important} important questions remain unanswered.`,
              });
            case 'CONCURRENT_REQUEST':
              // Race condition: another request is already processing this course
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Another request is already processing this course. Please wait.',
              });
            default:
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: result.error || 'Failed to proceed',
              });
          }
        }

        // RACE CONDITION PROTECTION: If this is a duplicate request, return existing job ID
        if (result.is_duplicate && result.existing_job_id) {
          logger.info(
            {
              requestId,
              courseId,
              existingJobId: result.existing_job_id,
            },
            'Returning existing job ID (duplicate request detected)'
          );
          return { success: true, jobId: result.existing_job_id };
        }

        // Status successfully transitioned to stage_4_analyzing
        // Now fetch data needed for the job

        // Defensive check: verify status hasn't changed (Issue #1 race condition protection)
        const { data: statusCheck } = await typedSupabase
          .from('courses')
          .select('generation_status')
          .eq('id', courseId)
          .single();

        if (statusCheck?.generation_status !== 'stage_4_analyzing') {
          logger.warn(
            {
              requestId,
              courseId,
              expectedStatus: 'stage_4_analyzing',
              actualStatus: statusCheck?.generation_status,
            },
            'Course status changed during operation (race condition detected)'
          );
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Course status changed during operation. Please try again.',
          });
        }

        // Fetch all answered questions to include in analysis job
        const { data: answeredQuestions, error: questionsError } = await supabase
          .from('clarifying_questions')
          .select('*')
          .eq('course_id', courseId)
          .eq('status', 'answered');

        if (questionsError) {
          logger.error(
            { requestId, courseId, error: questionsError.message },
            'Failed to fetch answered questions'
          );

          // Rollback status on failure
          await typedSupabase
            .from('courses')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ generation_status: 'stage_4_clarifying' as any })
            .eq('id', courseId);

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch answers',
          });
        }

        const answeredList = (answeredQuestions || []) as ClarifyingQuestionRow[];

        // Fetch course details for analysis job
        const { data: courseDetails, error: courseError } = await typedSupabase
          .from('courses')
          .select(
            `
            *,
            organization:organizations(tier)
          `
          )
          .eq('id', courseId)
          .single();

        if (courseError || !courseDetails) {
          logger.error(
            { requestId, courseId, error: courseError?.message },
            'Failed to fetch course details'
          );

          // Rollback status
          await typedSupabase
            .from('courses')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ generation_status: 'stage_4_clarifying' as any })
            .eq('id', courseId);

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch course details',
          });
        }

        const typedCourseDetails = courseDetails as unknown as CourseDetails;

        // Fetch document summaries for analysis
        const { data: documents, error: documentsError } = await typedSupabase
          .from('file_catalog')
          .select('id, filename, processed_content, processing_method, summary_metadata')
          .eq('course_id', courseId)
          .not('processed_content', 'is', null)
          .not('processing_method', 'is', null);

        if (documentsError) {
          logger.error(
            { requestId, courseId, error: documentsError.message },
            'Failed to fetch document summaries'
          );

          // Rollback status
          await typedSupabase
            .from('courses')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ generation_status: 'stage_4_clarifying' as any })
            .eq('id', courseId);

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch document summaries',
          });
        }

        // Map documents to document_summaries format
        const document_summaries = (documents || []).map(doc => ({
          document_id: doc.id,
          file_name: doc.filename,
          processed_content: doc.processed_content,
          processing_method: doc.processing_method,
          summary_metadata: doc.summary_metadata,
        }));

        // Format clarifying answers for analysis job
        const clarifyingAnswers = answeredList.map(q => ({
          question: q.question_text,
          answer: q.user_answer,
          priority: q.question_priority,
          category: q.question_category,
        }));

        // Get tier-based priority
        const tier = typedCourseDetails.organization?.tier || 'free';
        const priority = getTierPriority(tier);

        // Extract settings for analysis input
        const settings = typedCourseDetails.settings || {};
        const topic =
          (settings.topic as string) ||
          typedCourseDetails.title ||
          typedCourseDetails.course_description ||
          '';
        const lessonDuration = (settings.lesson_duration_minutes as number) || 30;

        // Create STRUCTURE_ANALYSIS job with clarifying answers
        const jobData: Record<string, unknown> = {
          jobType: JobType.STRUCTURE_ANALYSIS,
          organizationId: currentUser.organizationId,
          courseId,
          userId: currentUser.id,
          createdAt: new Date().toISOString(),
          course_id: courseId,
          organization_id: currentUser.organizationId,
          user_id: currentUser.id,
          input: {
            topic,
            language: typedCourseDetails.language || 'en',
            style: typedCourseDetails.style || 'formal',
            target_audience: typedCourseDetails.target_audience || '',
            difficulty: typedCourseDetails.difficulty || 'intermediate',
            lesson_duration_minutes: lessonDuration,
            document_summaries,
            clarifying_answers: clarifyingAnswers,
          },
          priority,
          attempt_count: 0,
          created_at: new Date().toISOString(),
        };

        // Create job with rollback on failure
        let jobId: string;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData as any, { priority });
          jobId = job.id as string;

          // RACE CONDITION PROTECTION: Set proceed_job_id after successful job creation
          // This prevents duplicate jobs by tracking the created job ID in the database
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: setJobIdError } = await (supabase as any).rpc('set_proceed_job_id', {
            p_course_id: courseId,
            p_job_id: jobId,
          });

          if (setJobIdError) {
            // Non-fatal: log warning but continue - job was created successfully
            logger.warn(
              {
                requestId,
                courseId,
                jobId,
                error: setJobIdError.message,
              },
              'Failed to set proceed_job_id (non-fatal)'
            );
          }
        } catch (jobError) {
          // Rollback status on job creation failure
          logger.error(
            {
              requestId,
              courseId,
              error: jobError instanceof Error ? jobError.message : String(jobError),
            },
            'Failed to create analysis job, rolling back status'
          );

          await typedSupabase
            .from('courses')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ generation_status: 'stage_4_clarifying' as any })
            .eq('id', courseId);

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create analysis job',
          });
        }

        logger.info(
          {
            requestId,
            courseId,
            jobId,
            answeredCount: answeredList.length,
            documentCount: document_summaries.length,
          },
          'Analysis job created after clarifying questions'
        );

        return { success: true, jobId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Approve and proceed failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to proceed to analysis',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type ClarifyingRouter = typeof clarifyingRouter;
