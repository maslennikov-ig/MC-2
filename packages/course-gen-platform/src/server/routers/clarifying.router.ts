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
import { JobType, StructureAnalysisJobData } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

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
 */
const submitAnswerSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  answer: z.string().min(1, 'Answer is required').max(10000, 'Answer too long'),
  answerSource: z.enum(['suggested', 'modified', 'custom']),
  selectedSuggestionIndex: z.number().int().min(0).optional(),
  userModification: z.string().max(10000).optional(),
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

/**
 * Schema for requestSecondRound endpoint
 */
const requestSecondRoundSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

// ============================================================================
// TYPES
// ============================================================================

/**
 * Question row from database
 * Note: This type matches the clarifying_questions table schema
 */
export interface QuestionRow {
  id: string;
  course_id: string;
  question_text: string;
  question_priority: string;
  question_category: string | null;
  suggested_answers: string[] | null;
  user_answer: string | null;
  answer_source: string | null;
  selected_suggestion_index: number | null;
  user_modification: string | null;
  iteration_round: number;
  status: string;
  order_index: number;
  created_at: string | null;
  answered_at: string | null;
  metadata: Record<string, unknown> | null;
}

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
 * Get Supabase admin client with RPC access for clarifying_questions table
 * Since clarifying_questions may not be in generated types, we use type assertions
 */
function getTypedSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabaseAdmin() as any;
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
): Promise<{ question: QuestionRow; course: CourseRow }> {
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

  return { question: question as QuestionRow, course };
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
 * - getQuestions: Retrieve all questions for a course
 * - getProgress: Get progress statistics
 * - submitAnswer: Submit an answer to a question
 * - skipQuestion: Skip a nice_to_have question
 * - approveAndProceed: Approve answers and continue to analysis
 * - requestSecondRound: Request additional questions
 */
export const clarifyingRouter = router({
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
    .use(createRateLimiter({ requests: 60, window: 60 })) // 60 reads per minute
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

        const allQuestions = (questions || []) as QuestionRow[];

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
    .use(createRateLimiter({ requests: 60, window: 60 }))
    .input(getQuestionsSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      try {
        // Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getTypedSupabaseAdmin();

        // Fetch all questions to calculate statistics
        const { data: questions, error } = await supabase
          .from('clarifying_questions')
          .select('id, question_priority, status, iteration_round')
          .eq('course_id', courseId);

        if (error) {
          logger.error(
            { requestId, courseId, error: error.message },
            'Failed to fetch questions for progress'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch progress',
          });
        }

        const allQuestions = (questions || []) as Pick<
          QuestionRow,
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

        // Get max iteration round
        const currentRound = Math.max(...allQuestions.map(q => q.iteration_round), 1);

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
    .use(createRateLimiter({ requests: 30, window: 60 })) // 30 submissions per minute
    .input(submitAnswerSchema)
    .mutation(async ({ ctx, input }) => {
      const { questionId, answer, answerSource, selectedSuggestionIndex, userModification } = input;
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

        // Validate answer source requirements
        if (answerSource === 'suggested' && selectedSuggestionIndex === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'selectedSuggestionIndex is required for suggested answers',
          });
        }

        if (
          answerSource === 'modified' &&
          (selectedSuggestionIndex === undefined || !userModification)
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'selectedSuggestionIndex and userModification are required for modified answers',
          });
        }

        // Custom answers should not have suggestion-related fields
        if (answerSource === 'custom' && selectedSuggestionIndex !== undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Custom answers should not include selectedSuggestionIndex',
          });
        }

        // Validate suggestion index if provided
        if (selectedSuggestionIndex !== undefined) {
          const suggestions = question.suggested_answers || [];
          if (selectedSuggestionIndex >= suggestions.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid suggestion index',
            });
          }
        }

        const supabase = getTypedSupabaseAdmin();

        // Update question with answer
        const { error: updateError } = await supabase
          .from('clarifying_questions')
          .update({
            user_answer: answer,
            answer_source: answerSource,
            selected_suggestion_index: selectedSuggestionIndex ?? null,
            user_modification: userModification ?? null,
            status: 'answered',
            answered_at: new Date().toISOString(),
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
    .use(createRateLimiter({ requests: 30, window: 60 }))
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
    .use(createRateLimiter({ requests: 10, window: 60 })) // Strict limit for job creation
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
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
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
        const result = rpcResult as {
          success: boolean;
          error?: string;
          code?: string;
          unanswered_critical?: number;
          unanswered_important?: number;
          current_status?: string;
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
            default:
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: result.error || 'Failed to proceed',
              });
          }
        }

        // Status successfully transitioned to stage_4_analyzing
        // Now fetch data needed for the job

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

        const answeredList = (answeredQuestions || []) as QuestionRow[];

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

  /**
   * Request second round of questions
   *
   * Purpose: Requests a second round of clarifying questions based on
   * the answers from round 1. Limited to 2 rounds maximum.
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
   * const result = await trpc.clarifying.requestSecondRound.mutate({
   *   courseId: '...',
   * });
   * // { success: true, jobId: '123' }
   * ```
   */
  requestSecondRound: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // Very strict limit
    .input(requestSecondRoundSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info({ requestId, courseId, userId: currentUser.id }, 'Request second round request');

      try {
        // Verify course access
        const course = await verifyCourseAccess(
          courseId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        // Verify course is in clarifying status
        if (course.generation_status !== 'stage_4_clarifying') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot request second round from status '${course.generation_status}'. Expected: stage_4_clarifying`,
          });
        }

        const supabase = getTypedSupabaseAdmin();

        // Check current round
        const { data: questions, error: questionsError } = await supabase
          .from('clarifying_questions')
          .select('iteration_round')
          .eq('course_id', courseId)
          .order('iteration_round', { ascending: false })
          .limit(1);

        if (questionsError) {
          logger.error(
            { requestId, courseId, error: questionsError.message },
            'Failed to check current round'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check current round',
          });
        }

        const questionList = (questions || []) as Pick<QuestionRow, 'iteration_round'>[];
        const currentRound = questionList[0]?.iteration_round || 1;

        if (currentRound >= 2) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Maximum of 2 rounds of clarifying questions allowed',
          });
        }

        // Fetch answered questions from round 1 for context
        const { data: round1Answers, error: answersError } = await supabase
          .from('clarifying_questions')
          .select('*')
          .eq('course_id', courseId)
          .eq('iteration_round', 1)
          .eq('status', 'answered');

        if (answersError) {
          logger.error(
            { requestId, courseId, error: answersError.message },
            'Failed to fetch round 1 answers'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch previous answers',
          });
        }

        const round1List = (round1Answers || []) as QuestionRow[];

        // Format round 1 answers for job
        const previousAnswers = round1List.map(q => ({
          question: q.question_text,
          answer: q.user_answer,
          priority: q.question_priority,
          category: q.question_category,
        }));

        // Get course details for job (use typed supabase)
        const typedSupabase = getSupabaseAdmin();
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
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch course details',
          });
        }

        const typedCourseDetails = courseDetails as unknown as CourseDetails;

        // Get tier-based priority
        const tier = typedCourseDetails.organization?.tier || 'free';
        const priority = getTierPriority(tier);

        // Create STRUCTURE_ANALYSIS job for round 2
        // The handler will extract iterationRound and previousAnswers to pass to orchestrator
        const jobData: StructureAnalysisJobData & {
          iterationRound?: number;
          previousAnswers?: Array<{
            question: string;
            answer: string;
            priority: string;
            category: string;
          }>;
        } = {
          jobType: JobType.STRUCTURE_ANALYSIS,
          organizationId: currentUser.organizationId,
          courseId,
          userId: currentUser.id,
          createdAt: new Date().toISOString(),
          locale: 'ru', // Default to Russian, handler will fetch actual locale from DB
          iterationRound: 2,
          previousAnswers: previousAnswers.map(a => ({
            question: a.question,
            answer: a.answer || '',
            priority: a.priority,
            category: a.category || 'general', // Default category if null
          })),
        };

        const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData as StructureAnalysisJobData, {
          priority,
        });
        const jobId = job.id as string;

        logger.info(
          {
            requestId,
            courseId,
            jobId,
            previousAnswersCount: previousAnswers.length,
          },
          'Second round questions job created'
        );

        return { success: true, jobId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error(
          { requestId, error: error instanceof Error ? error.message : String(error) },
          'Request second round failed'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to request second round',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type ClarifyingRouter = typeof clarifyingRouter;
