import { type LessonGraphStateType } from '../state';
import { logger } from '@/shared/logger';
import { HANDLER_CONFIG } from '../config';

/**
 * Routing function for judge node conditional edges
 *
 * Determines if we need to loop back to generator or end based on judge output.
 *
 * IMPORTANT: This is a PURE ROUTING function. It must NOT mutate state.
 * All state transitions (needsHumanReview, reviewInfo, errors) are set
 * by the preceding node through the LangGraph channel/reducer system.
 * Direct state mutations in routing functions bypass channels and are lost
 * in the final graph output.
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

  // Priority 2: Max retries exceeded — the judge node or executeStage6 safety-net
  // handles setting needsHumanReview/reviewInfo. We just route to __end__.
  if (state.needsRegeneration && state.retryCount >= maxRetries) {
    logger.warn(
      {
        lessonId: state.lessonSpec.lesson_id,
        retryCount: state.retryCount,
        maxRetries,
        qualityScore: state.qualityScore,
      },
      'Judge routing: Max regeneration retries exceeded - ending graph'
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
 * - '__end__': Retry budgets exhausted (review_required set by node via channel)
 *
 * IMPORTANT: This is a PURE ROUTING function. It must NOT mutate state.
 * The self-reviewer node sets all state transitions (regenerationMode,
 * regenerateCount, needsHumanReview, reviewInfo, errors) through the
 * LangGraph channel/reducer system via its return value.
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
    // Terminal: the self-reviewer node already set needsHumanReview via channel
    if (state.needsHumanReview) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          retryCount: state.retryCount,
          truncationCount: state.truncationCount,
          regenerateCount: state.regenerateCount,
          regenerationMode: state.regenerationMode,
        },
        'SelfReviewer routing: Retry/truncation budget exhausted (review_required set by node) - ending graph'
      );
      return '__end__';
    }

    // Escalation/continuation: the node already set regenerationMode via channel
    if (
      state.regenerationMode === 'full_regenerate' ||
      state.regenerationMode === 'truncation_continuation'
    ) {
      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          regenerationMode: state.regenerationMode,
          retryCount: state.retryCount,
          truncationCount: state.truncationCount,
          regenerateCount: state.regenerateCount,
        },
        `SelfReviewer routing: ${state.regenerationMode} - routing to generator`
      );
      return 'generator';
    }

    // Fallback: no mode set yet (should not happen), route to generator
    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        status,
        reasoning: selfReviewResult.reasoning,
        issueCount: selfReviewResult.issues.length,
      },
      'SelfReviewer routing: REGENERATE status - routing to generator'
    );
    return 'generator';
  }

  // Section-level regeneration
  const sectionsToRegenerate = selfReviewResult.sectionsToRegenerate;
  if (sectionsToRegenerate && sectionsToRegenerate.length > 0) {
    if (sectionsToRegenerate.length > HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          requestedSections: sectionsToRegenerate.length,
          maxSectionsToRegenerate: HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE,
          sectionsToRegenerate,
        },
        'SelfReviewer routing: Section regeneration request exceeds cap - ending graph (terminal state set by node)'
      );
      return '__end__';
    }

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
