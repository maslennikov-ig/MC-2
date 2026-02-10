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
import { ClarifyingQuestionRow, UserAnswerValue } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';

import {
  CLARIFYING_RATE_LIMITS,
  getQuestionsSchema,
  submitAnswerSchema,
  submitMultipleAnswersSchema,
  skipQuestionSchema,
  approveAndProceedSchema,
} from './clarifying-schemas';

import {
  verifyCourseAccess,
  verifyQuestionAccess,
  validateAnswerForQuestionType,
  validateAnswerSource,
  validateSuggestionIndexes,
  persistAnswer,
  checkCanProceed,
  executeAtomicApproval,
  verifyStatusTransition,
  fetchAnsweredQuestions,
  fetchCourseDetailsForJob,
  fetchDocumentSummaries,
  createAnalysisJob,
} from './clarifying-helpers';

import {
  analyzeSufficiency,
  storeQuestions,
  extractAnswerString,
  type Phase05Input,
} from '../../stages/stage4-analysis/phases/phase-0.5-clarifying';

// Re-export public API from extracted modules
export { CLARIFYING_RATE_LIMITS } from './clarifying-schemas';
export type { CourseRow, CourseDetails } from './clarifying-helpers';

/**
 * Type re-exports for convenience
 * These are now imported from @megacampus/shared-types to ensure consistency
 */
export type {
  QuestionType,
  UserAnswerValue,
  ClarifyingQuestionRow,
} from '@megacampus/shared-types';

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
 */
export const clarifyingRouter = router({
  /**
   * Check if clarifying questions are enabled for a course
   */
  isEnabled: protectedProcedure
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      const { data: course, error } = await supabase
        .from('courses')
        .select('settings')
        .eq('id', courseId)
        .single();

      if (error) {
        return { enabled: false };
      }

      const settings = (course?.settings as Record<string, unknown>) || {};
      const enabled = (settings.clarifying_questions_enabled as boolean) || false;

      return { enabled };
    }),

  /**
   * Get all questions for a course
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
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getSupabaseAdmin();

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
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getSupabaseAdmin();

        const [questionsResult, courseResult] = await Promise.all([
          supabase
            .from('clarifying_questions')
            .select('id, question_priority, status, iteration_round')
            .eq('course_id', courseId),
          supabase.from('courses').select('generation_mode').eq('id', courseId).single(),
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

        const canProceed =
          criticalAnswered === criticalTotal && importantAnswered === importantTotal;

        // Calculate current round from max iteration_round
        const maxRound = allQuestions.reduce((max, q) => Math.max(max, q.iteration_round || 1), 1);
        const currentRound = maxRound;
        const maxRounds = 3;

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
            currentRound,
            maxRounds,
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
          maxRounds,
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
        const { question, course } = await verifyQuestionAccess(
          questionId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        const questionType = question.question_type || 'open';
        const isMultiChoice = questionType === 'multi_choice';

        validateAnswerForQuestionType(questionType, answer, answers);

        const effectiveAnswerSource = validateAnswerSource(
          answerSource,
          questionType,
          selectedSuggestionIndex,
          selectedSuggestionIndexes,
          userModification,
          questionId
        );

        const suggestions = question.suggested_answers || [];
        validateSuggestionIndexes(suggestions, selectedSuggestionIndex, selectedSuggestionIndexes);

        await persistAnswer({
          questionId,
          isMultiChoice,
          answer,
          answers,
          effectiveAnswerSource,
          selectedSuggestionIndex,
          selectedSuggestionIndexes,
          userModification,
          questionMetadata: question.metadata,
          requestId,
        });

        const canProceed = await checkCanProceed(course.id, requestId);
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
        const supabase = getSupabaseAdmin();
        const successfulIds: string[] = [];
        const failedIds: string[] = [];

        const questionIds = submissions.map(s => s.questionId);

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

        const foundIds = new Set(questionList.map(q => q.id));
        const missingIds = questionIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Questions not found: ${missingIds.join(', ')}`,
          });
        }

        const courseIds = new Set(questionList.map(q => q.course_id));
        if (courseIds.size > 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'All questions must belong to the same course',
          });
        }

        const courseId = questionList[0].course_id;
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const questionMap = new Map(questionList.map(q => [q.id, q]));
        const now = new Date().toISOString();

        for (const submission of submissions) {
          const question = questionMap.get(submission.questionId);
          if (!question) {
            failedIds.push(submission.questionId);
            continue;
          }

          if (question.status === 'answered') {
            logger.debug(
              { requestId, questionId: submission.questionId },
              'Question already answered, skipping'
            );
            successfulIds.push(submission.questionId);
            continue;
          }

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

          const userAnswerValue: UserAnswerValue = { value: submission.answer };

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

        const canProceed = await checkCanProceed(courseId, requestId);

        logger.info(
          {
            requestId,
            successCount: successfulIds.length,
            failedCount: failedIds.length,
            canProceed,
          },
          'Batch answer submission completed'
        );

        return { successCount: successfulIds.length, failedIds, canProceed };
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
   * Skip a question (only nice_to_have priority)
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
        const { question } = await verifyQuestionAccess(
          questionId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

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

        const supabase = getSupabaseAdmin();

        const { error: updateError } = await supabase
          .from('clarifying_questions')
          .update({ status: 'skipped' })
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
   * Approve answers and proceed to analysis.
   * Uses atomic RPC function with FOR UPDATE lock to prevent race conditions.
   * Supports multi-round clarification (up to 3 rounds).
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
      const { courseId, forceProceed } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info(
        { requestId, courseId, userId: currentUser.id, forceProceed },
        'Approve and proceed request'
      );

      try {
        const result = await executeAtomicApproval(
          courseId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );

        // Duplicate request detected: return existing job ID
        if (result.is_duplicate && result.existing_job_id) {
          logger.info(
            { requestId, courseId, existingJobId: result.existing_job_id },
            'Returning existing job ID (duplicate request detected)'
          );
          return { success: true, jobId: result.existing_job_id };
        }

        const supabase = getSupabaseAdmin();

        await verifyStatusTransition(supabase, courseId, requestId);

        // Multi-round sufficiency analysis (if not forced and not at max rounds)
        if (!forceProceed) {
          // Get current max round
          const { data: roundData } = await supabase
            .from('clarifying_questions')
            .select('iteration_round')
            .eq('course_id', courseId)
            .order('iteration_round', { ascending: false })
            .limit(1);

          const currentRound =
            (roundData?.[0] as { iteration_round: number } | undefined)?.iteration_round || 1;

          logger.debug(
            { requestId, courseId, currentRound },
            'Checking if sufficiency analysis needed'
          );

          if (currentRound < 3) {
            // Get all answered questions for sufficiency analysis
            const allAnswered = await fetchAnsweredQuestions(supabase, courseId, requestId);
            const answersForAnalysis = allAnswered.map(q => ({
              question: q.question_text,
              answer: extractAnswerString(q.user_answer),
              category: q.question_category,
            }));

            // Build Phase 0.5 input for sufficiency analysis
            const { data: courseForInput } = await supabase
              .from('courses')
              .select('title, course_description, target_audience, language')
              .eq('id', courseId)
              .single();

            if (!courseForInput) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Course not found for sufficiency analysis',
              });
            }

            const phase05Input: Phase05Input = {
              course_id: courseId,
              budgetAllocation: null,
              courseContext: {
                title: courseForInput.title || '',
                description: courseForInput.course_description || undefined,
                target_audience: courseForInput.target_audience || undefined,
              },
              language: courseForInput.language || 'en',
            };

            logger.info(
              { requestId, courseId, currentRound, answerCount: answersForAnalysis.length },
              'Running sufficiency analysis'
            );

            const verdict = await analyzeSufficiency(
              phase05Input,
              answersForAnalysis,
              currentRound
            );

            if (
              !verdict.is_sufficient &&
              verdict.follow_up_questions &&
              verdict.follow_up_questions.length > 0
            ) {
              // Store follow-up questions with next round
              const nextRound = currentRound + 1;
              await storeQuestions(courseId, verdict.follow_up_questions, nextRound);

              // Rollback status to clarifying
              await supabase
                .from('courses')
                .update({
                  generation_status: 'stage_4_clarifying',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', courseId);

              logger.info(
                {
                  requestId,
                  courseId,
                  currentRound,
                  nextRound,
                  followUpCount: verdict.follow_up_questions.length,
                  confidence: verdict.confidence,
                  gapCount: verdict.gaps.length,
                },
                'Follow-up questions generated, returning to clarifying'
              );

              return {
                success: true,
                needsFollowUp: true,
                round: nextRound,
                gaps: verdict.gaps,
                followUpCount: verdict.follow_up_questions.length,
              };
            }

            logger.info(
              { requestId, courseId, currentRound, confidence: verdict.confidence },
              'Sufficiency analysis passed, proceeding to analysis'
            );
            // If sufficient — fall through to create analysis job
          } else {
            logger.info(
              { requestId, courseId, currentRound },
              'Max rounds reached, proceeding to analysis'
            );
          }
          // If currentRound >= 3 — fall through to create analysis job (no more follow-ups)
        } else {
          logger.info({ requestId, courseId }, 'Force proceed enabled, skipping sufficiency check');
        }

        // Fetch data and create analysis job
        const [answeredList, courseDetails, documentSummaries] = await Promise.all([
          fetchAnsweredQuestions(supabase, courseId, requestId),
          fetchCourseDetailsForJob(supabase, courseId, requestId),
          fetchDocumentSummaries(supabase, courseId, requestId),
        ]);

        const jobId = await createAnalysisJob({
          courseId,
          userId: currentUser.id,
          organizationId: currentUser.organizationId,
          courseDetails,
          answeredQuestions: answeredList,
          documentSummaries,
          requestId,
        });

        logger.info(
          {
            requestId,
            courseId,
            jobId,
            answeredCount: answeredList.length,
            documentCount: documentSummaries.length,
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
