/**
 * Generator Node - Single-call lesson content generation
 * @module stages/stage6-lesson-content/nodes/generator
 *
 * Generates complete lesson content in a single LLM call with
 * duration-aware word budget. Produces intro, sections, summary,
 * exercises, and lesson digest in one pass.
 *
 * Flow:
 * 1. Call generateLessonSingleCall() with all context
 * 2. Run Mermaid fix pipeline on full content
 * 3. Validate for prompt leakage
 * 4. Return generatedContent + lessonDigest
 *
 * Input: lessonSpec, ragChunks, language, style, analysisResult
 * Output: generatedContent, lessonDigest, tokensUsed, durationMs
 */

import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { getContentLabels } from '@megacampus/shared-types';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import { runMermaidFixPipeline } from '../utils/mermaid-fix-pipeline';

// Import from extracted modules
import { calculateDynamicContextWindow } from './generator/generator-constants';
import { validateGeneratedContent } from './generator/generator-content';
import { generateSection } from './generator/generator-section';
import {
  extractLessonDigest,
  generateLessonSingleCall,
  generateTruncationContinuation,
} from './generator/generator-single-call';

// Re-export for backward compatibility (used by section-regenerator)
export { calculateDynamicContextWindow, generateSection };

/**
 * Generator Node - Single-call lesson content generation
 *
 * Generates complete lesson content in one LLM call with duration-aware
 * word budget. Replaces the previous N+3 serial loop approach.
 *
 * @param state - Current graph state with lessonSpec and ragChunks
 * @returns Updated state with generatedContent, lessonDigest, and metrics
 */
export async function generatorNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, ragChunks, courseId, lessonUuid, language, style, analysisResult } = state;
  const generationMode = state.regenerationMode;
  const useContinuation = generationMode === 'truncation_continuation' && !!state.generatedContent;

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
      durationMinutes: lessonSpec.estimated_duration_minutes,
      generationMode: generationMode ?? 'single_call',
    },
    'Generator node: Starting single-call content generation'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'generator',
    stepName: 'generator_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      lessonTitle: lessonSpec.title,
      moduleNumber: lessonSpec.lesson_id.split('.')[0],
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
      language,
      style: style ?? 'default',
      generationMethod: useContinuation ? 'truncation-continuation' : 'single-call',
      regenerateCount: state.regenerateCount ?? 0,
      truncationCount: state.truncationCount ?? 0,
      rejectedTokens: state.rejectedTokens ?? 0,
    },
    durationMs: 0,
  });

  try {
    // ========================================================================
    // 1. GENERATE FULL LESSON IN SINGLE CALL
    // ========================================================================
    let generatedContent: string;
    let lessonDigest: string;
    let totalTokens: number;
    let modelUsed: string;

    if (useContinuation) {
      const continuationResult = await generateTruncationContinuation(
        lessonSpec,
        state.generatedContent!,
        language
      );
      const labels = getContentLabels(language);
      const digestExtraction = extractLessonDigest(
        continuationResult.mergedContent,
        labels.lessonDigest
      );

      generatedContent = digestExtraction.content;
      lessonDigest = digestExtraction.digest || state.lessonDigest || '';
      totalTokens = continuationResult.tokensUsed;
      modelUsed = continuationResult.modelUsed;
    } else {
      const result = await generateLessonSingleCall(
        lessonSpec,
        ragChunks,
        language,
        state.modelOverride,
        style,
        analysisResult
      );
      generatedContent = result.content;
      lessonDigest = result.lessonDigest;
      totalTokens = result.tokensUsed;
      modelUsed = result.modelUsed;
    }

    // ========================================================================
    // 2. MERMAID FIX PIPELINE (on full content, single pass)
    // ========================================================================
    try {
      const pipelineResult = await runMermaidFixPipeline(generatedContent);
      if (pipelineResult.modified) {
        logger.debug(
          {
            lessonId: lessonSpec.lesson_id,
            metrics: pipelineResult.metrics,
          },
          'Mermaid fix pipeline applied to generated content'
        );
        generatedContent = pipelineResult.content;
      }
    } catch (error) {
      logger.warn(
        {
          lessonId: lessonSpec.lesson_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Mermaid fix pipeline failed, using original content'
      );
      // Keep original content - self-reviewer will catch issues later
    }

    // ========================================================================
    // 3. VALIDATE FOR PROMPT TEMPLATE LEAKAGE
    // ========================================================================
    const validation = validateGeneratedContent(generatedContent);
    if (!validation.isValid) {
      logger.error(
        {
          lessonId: lessonSpec.lesson_id,
          detectedMarkers: validation.detectedMarkers,
        },
        'Generated content contains prompt template markers'
      );
    }

    // ========================================================================
    // 4. CALCULATE METRICS AND RETURN
    // ========================================================================
    const durationMs = Math.round(performance.now() - startTime);
    const wordCount = generatedContent.split(/\s+/).filter(Boolean).length;

    // Count H2 sections for metrics
    const h2Count = (generatedContent.match(/^## /gm) || []).length;

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        contentLength: generatedContent.length,
        wordCount,
        h2Count,
        hasDigest: lessonDigest.length > 0,
        totalTokens,
        durationMs,
        generationMethod: useContinuation ? 'truncation-continuation' : 'single-call',
      },
      'Generator node: Single-call content generation complete'
    );

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'generator',
      stepName: 'generator_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      outputData: {
        contentLength: generatedContent.length,
        wordCount,
        h2Count,
        hasDigest: lessonDigest.length > 0,
        digestLength: lessonDigest.length,
        generationMethod: useContinuation ? 'truncation-continuation' : 'single-call',
        targetWordCount: (lessonSpec.estimated_duration_minutes || 15) * 150,
        selectedModel: state.selectedModel,
        selectedModelTier: state.selectedModelTier,
        selectedModelTierReason: state.selectedModelTierReason,
        modelOverride: state.modelOverride,
        regenerateCount: state.regenerateCount ?? 0,
        truncationCount: state.truncationCount ?? 0,
        rejectedTokens: state.rejectedTokens ?? 0,
      },
      modelUsed,
      tokensUsed: totalTokens,
      durationMs,
    });

    return {
      generatedContent,
      lessonDigest,
      modelUsed,
      tokensUsed: totalTokens,
      lastGenerationTokens: totalTokens,
      durationMs,
      currentNode: 'selfReviewer',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Math.round(performance.now() - startTime);

    logger.error(
      {
        lessonId: lessonSpec.lesson_id,
        error: errorMessage,
      },
      'Generator node: Single-call content generation failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'generator',
      stepName: 'generator_error',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      errors: [`Generator failed: ${errorMessage}`],
      currentNode: 'generator',
      lastGenerationTokens: 0,
      durationMs,
    };
  }
}
