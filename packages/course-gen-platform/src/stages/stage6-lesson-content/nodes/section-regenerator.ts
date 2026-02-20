import type { LessonGraphStateType, LessonGraphStateUpdate, LessonGraphNode } from '../state';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { regenerateSections } from '../utils/section-regenerator';
import { runMermaidFixPipeline } from '../utils/mermaid-fix-pipeline';
import { validateGeneratedContent } from './generator/generator-content';

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
    const regenModelUsed =
      result.modelsUsed.length === 0
        ? null
        : result.modelsUsed.length === 1
          ? result.modelsUsed[0]
          : result.modelsUsed.join(', ');
    const noOpSections = result.noOpSections ?? [];

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
        noOpSections,
        modelsUsed: result.modelsUsed,
        tokensUsed: result.tokensUsed,
      },
      modelUsed: regenModelUsed,
      tokensUsed: result.tokensUsed,
      durationMs,
    });

    if (noOpSections.length > 0) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          noOpSections,
          failedSections: result.failedSections,
        },
        'Section regenerator: Detected no-op section regeneration'
      );

      await logTrace({
        courseId: state.courseId,
        lessonId: state.lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'section_regenerator',
        stepName: 'section_regen_noop',
        inputData: {
          lessonLabel: state.lessonSpec.lesson_id,
          sectionsToRegenerate,
        },
        outputData: {
          noOpSections,
          failedSections: result.failedSections,
        },
        durationMs,
      });
    }

    if (!result.success) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          failedSections: result.failedSections,
          noOpSections,
          errorMessage: result.errorMessage,
        },
        'Section regenerator: Some sections failed, proceeding with partial result'
      );
    }

    // Run Mermaid fix pipeline on regenerated content (same as generator-node.ts)
    // Section regenerator uses LLM to regenerate sections, which can introduce
    // broken mermaid syntax (escaped quotes, bad arrows, etc.)
    let finalContent = result.content;
    try {
      const pipelineResult = await runMermaidFixPipeline(finalContent);
      if (pipelineResult.modified) {
        logger.debug(
          {
            lessonId: state.lessonSpec.lesson_id,
            metrics: pipelineResult.metrics,
          },
          'Section regenerator: Mermaid fix pipeline applied to regenerated content'
        );
        finalContent = pipelineResult.content;
      }
    } catch (error) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Section regenerator: Mermaid fix pipeline failed, using original content'
      );
    }

    // Validate for prompt template markers (hallucination detection)
    // Pattern: log-only — don't reject, let judge make final decision
    // (matches generator-node.ts; refinement-level functions reject in patcher/expander)
    const validation = validateGeneratedContent(finalContent);
    if (!validation.isValid) {
      logger.warn(
        {
          event: 'hallucination_detected',
          component: 'section-regenerator',
          lessonId: state.lessonSpec.lesson_id,
          markersCount: validation.detectedMarkers.length,
          detectedMarkers: validation.detectedMarkers,
        },
        'Section regenerator: Detected prompt template markers in regenerated content'
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
      generatedContent: finalContent,
      modelUsed: regenModelUsed,
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
