import { type LessonGraphStateType } from '../state';
import { logger } from '@/shared/logger';
import { HANDLER_CONFIG } from '../config';

function markReviewRequired(state: LessonGraphStateType, reason: string): void {
  const existingReasons = state.reviewInfo?.reasons ?? [];
  const reasons = existingReasons.includes(reason) ? existingReasons : [...existingReasons, reason];

  state.needsHumanReview = true;
  state.needsRegeneration = false;
  state.reviewInfo = {
    needsReview: true,
    reasons,
    factualAccuracyScore: state.reviewInfo?.factualAccuracyScore,
    unverifiedClaims: state.reviewInfo?.unverifiedClaims,
  };
}

/**
 * Routing function for judge node conditional edges
 *
 * Determines if we need to loop back to generator or end based on judge output.
 *
 * @param state - Current graph state
 * @returns Next node name or END
 */
export function shouldRetryAfterJudge(state: LessonGraphStateType): string {
  const maxRetries = HANDLER_CONFIG.MAX_REGENERATION_RETRIES;

  // Priority 1: If regeneration needed and we haven't exceeded retry limit, retry
  if (state.needsRegeneration && state.retryCount < maxRetries) {
    logger.debug(
      {
        lessonId: state.lessonSpec.lesson_id,
        retryCount: state.retryCount,
        maxRetries,
      },
      'Judge routing: Routing to generator for regeneration'
    );
    return 'generator';
  }

  // Priority 2: Max retries exceeded - log error and end
  if (state.needsRegeneration && state.retryCount >= maxRetries) {
    const reason =
      `Max regeneration retries (${maxRetries}) exceeded. ` +
      `Latest quality score: ${((state.qualityScore ?? 0) * 100).toFixed(1)}%.`;

    logger.warn(
      {
        lessonId: state.lessonSpec.lesson_id,
        retryCount: state.retryCount,
        maxRetries,
        qualityScore: state.qualityScore,
      },
      'Judge routing: Max regeneration retries exceeded - marking as review_required'
    );

    markReviewRequired(state, reason);
    state.errors.push(
      `${reason} Review LessonSpecification for key_topics/lesson_objectives mismatch.`
    );
    return '__end__';
  }

  // Priority 3: If content was accepted or needs human review, end the graph
  if (state.lessonContent !== null || state.needsHumanReview) {
    logger.debug(
      {
        lessonId: state.lessonSpec.lesson_id,
        hasContent: state.lessonContent !== null,
        needsHumanReview: state.needsHumanReview,
      },
      'Judge routing: Ending graph'
    );
    return '__end__';
  }

  // Default: end the graph (other condition)
  logger.debug(
    {
      lessonId: state.lessonSpec.lesson_id,
      retryCount: state.retryCount,
      needsRegeneration: state.needsRegeneration,
    },
    'Judge routing: Ending graph (default)'
  );
  return '__end__';
}

/**
 * Routing function for selfReviewer node conditional edges
 *
 * Determines next step based on self-review evaluation:
 * - 'judge': Content passed or needs judge attention (PASS, PASS_WITH_FLAGS, FIXED, FLAG_TO_JUDGE)
 * - 'sectionRegenerator': Specific sections need regeneration (sectionsToRegenerate populated)
 * - 'generator': Content needs regeneration (REGENERATE status)
 * - '__end__': Max retries exceeded
 *
 * @param state - Current graph state after selfReviewer evaluation
 * @returns Next node name: 'judge', 'sectionRegenerator', 'generator', or '__end__'
 */
export function shouldProceedToJudge(state: LessonGraphStateType): string {
  const selfReviewResult = state.selfReviewResult;

  // If no self-review result, proceed to judge (backward compatibility)
  if (!selfReviewResult) {
    logger.warn(
      {
        lessonId: state.lessonSpec?.lesson_id ?? 'unknown',
      },
      'SelfReviewer routing: No selfReviewResult, proceeding to judge'
    );
    return 'judge';
  }

  const status = selfReviewResult.status;

  // REGENERATE status: Fatal errors detected, skip judge and restart pipeline
  if (status === 'REGENERATE') {
    const isTruncationContinuation = state.regenerationMode === 'truncation_continuation';

    if (isTruncationContinuation) {
      const maxContinuationAttempts = HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS;
      const truncationCount = state.truncationCount ?? 0;

      if (truncationCount > maxContinuationAttempts) {
        const reason =
          `Truncation continuation attempts exceeded (${maxContinuationAttempts}). ` +
          `Marked as review_required (fail-open).`;

        logger.warn(
          {
            lessonId: state.lessonSpec.lesson_id,
            truncationCount,
            maxContinuationAttempts,
          },
          'SelfReviewer routing: Truncation continuation cap exceeded - marking as review_required'
        );

        markReviewRequired(state, reason);
        state.errors.push(reason);
        return '__end__';
      }

      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          truncationCount,
          maxContinuationAttempts,
        },
        'SelfReviewer routing: truncation-only regenerate - routing to generator continuation'
      );

      return 'generator';
    }

    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        status,
        reasoning: selfReviewResult.reasoning,
        issueCount: selfReviewResult.issues.length,
      },
      'SelfReviewer routing: REGENERATE status - routing to generator'
    );

    // Check retry limit
    const maxRetries = HANDLER_CONFIG.MAX_REGENERATION_RETRIES;
    if (state.retryCount >= maxRetries) {
      const reason = `Self-review regeneration retries exceeded (${maxRetries}). Last status: ${status}.`;

      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          retryCount: state.retryCount,
          maxRetries,
        },
        'SelfReviewer routing: Max retries exceeded - marking as review_required'
      );
      markReviewRequired(state, reason);
      state.errors.push(reason);
      return '__end__';
    }

    return 'generator';
  }

  // NEW: Check if specific sections need regeneration (not full regenerate)
  const sectionsToRegenerate = selfReviewResult.sectionsToRegenerate;
  if (sectionsToRegenerate && sectionsToRegenerate.length > 0) {
    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        status,
        sectionsToRegenerate,
        sectionCount: sectionsToRegenerate.length,
      },
      'SelfReviewer routing: Section-level regeneration needed - routing to sectionRegenerator'
    );

    return 'sectionRegenerator';
  }

  // PASS, PASS_WITH_FLAGS, FIXED, FLAG_TO_JUDGE: Proceed to judge
  logger.debug(
    {
      lessonId: state.lessonSpec.lesson_id,
      status,
      heuristicsPassed: selfReviewResult.heuristicsPassed,
      issueCount: selfReviewResult.issues.length,
    },
    'SelfReviewer routing: Proceeding to judge'
  );

  return 'judge';
}
