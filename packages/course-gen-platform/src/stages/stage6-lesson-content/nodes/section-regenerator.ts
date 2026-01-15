import type { LessonGraphStateType, LessonGraphStateUpdate, LessonGraphNode } from '../state';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { regenerateSections } from '../utils/section-regenerator';

/**
 * Section Regenerator Node - Regenerates specific sections identified by self-reviewer
 *
 * Called when selfReviewResult.sectionsToRegenerate is populated.
 * Regenerates only the problematic sections and merges them back into the content.
 *
 * @param state - Current LangGraph state after selfReviewer node
 * @returns Updated state with regenerated content
 */
export async function sectionRegeneratorNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();
  const sectionsToRegenerate = state.selfReviewResult?.sectionsToRegenerate || [];

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      currentNode: 'sectionRegenerator',
      sectionsToRegenerate,
      sectionCount: sectionsToRegenerate.length,
    },
    'Section regenerator: Starting section-level regeneration'
  );

  // Log trace at start
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'section_regenerator',
    stepName: 'section_regen_start',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      sectionsToRegenerate,
    },
    durationMs: 0,
  });

  try {
    // Regenerate sections
    const result = await regenerateSections({
      markdown: state.generatedContent || '',
      sectionIds: sectionsToRegenerate,
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks,
      language: state.language,
      modelOverride: state.modelOverride,
      style: state.style,
    });

    const durationMs = Date.now() - startTime;

    // Log trace at completion
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'section_regenerator',
      stepName: 'section_regen_complete',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
      },
      outputData: {
        success: result.success,
        regeneratedSections: result.regeneratedSections,
        failedSections: result.failedSections,
        tokensUsed: result.tokensUsed,
      },
      tokensUsed: result.tokensUsed,
      durationMs,
    });

    if (!result.success) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          failedSections: result.failedSections,
          errorMessage: result.errorMessage,
        },
        'Section regenerator: Some sections failed, proceeding with partial result'
      );
    }

    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        regeneratedSections: result.regeneratedSections,
        tokensUsed: result.tokensUsed,
        durationMs,
      },
      'Section regenerator: Completed'
    );

    return {
      currentNode: 'sectionRegenerator' as LessonGraphNode,
      generatedContent: result.content,
      tokensUsed: result.tokensUsed,
      durationMs,
      sectionRegenerationResult: {
        sectionsRegenerated: result.regeneratedSections,
        tokensUsed: result.tokensUsed,
        durationMs,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error(
      {
        lessonId: state.lessonSpec.lesson_id,
        error: errorMessage,
        durationMs,
      },
      'Section regenerator: Failed with exception'
    );

    // Log trace on error
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'section_regenerator',
      stepName: 'section_regen_error',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    // On error, proceed to judge with original content
    return {
      currentNode: 'sectionRegenerator' as LessonGraphNode,
      // No change to generatedContent
      errors: [`Section regenerator error: ${errorMessage}`],
      durationMs,
    };
  }
}
