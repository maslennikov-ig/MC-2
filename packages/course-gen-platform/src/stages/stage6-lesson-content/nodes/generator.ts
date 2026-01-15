/**
 * Generator Node - Serial section-by-section content generation
 * @module stages/stage6-lesson-content/nodes/generator
 *
 * Replaces the Planner + Expander + Assembler + Smoother pipeline with a
 * single serial loop that generates content section-by-section with context window.
 *
 * Flow:
 * 1. Generate Introduction (using intro_blueprint)
 * 2. Loop through sections sequentially, accumulating context
 * 3. Generate Summary at the end
 * 4. Return full markdown content
 *
 * Context Window Strategy:
 * - Keep last ~5000 characters of generated content
 * - Include in prompt as <previous_context> section
 * - Enables natural transitions without separate Smoother node
 *
 * Input: lessonSpec, ragChunks, language
 * Output: generatedContent (full markdown), tokensUsed, durationMs
 */

import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { getRecommendedTemperatureV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { getContentLabels } from '@megacampus/shared-types';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import { runMermaidFixPipeline } from '../utils/mermaid-fix-pipeline';

// Import from extracted modules
import { calculateDynamicContextWindow } from './generator/generator-constants';
import {
  generateIntroduction,
  generateSummary,
  generateExercises,
  validateGeneratedContent,
} from './generator/generator-content';
import { generateSection } from './generator/generator-section';

// Re-export for backward compatibility
export { calculateDynamicContextWindow, generateSection };

/**
 * Generator Node - Serial section-by-section content generation
 *
 * Replaces the Planner + Expander + Assembler + Smoother pipeline with a
 * single serial loop. Generates content sequentially with context accumulation.
 *
 * Flow:
 * 1. Generate Introduction (using intro_blueprint)
 * 2. Loop through sections, accumulating context window
 * 3. Generate Summary
 * 4. Return full markdown
 *
 * @param state - Current graph state with lessonSpec and ragChunks
 * @returns Updated state with generatedContent and metrics
 */
export async function generatorNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, ragChunks, courseId, lessonUuid, language, style } = state;

  // Get localized section headers (supports all 19 languages via shared-types)
  const headers = getContentLabels(language);

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
    },
    'Generator node: Starting serial content generation'
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
    },
    durationMs: 0,
  });

  try {
    // Get temperature based on content archetype
    const temperature = getRecommendedTemperatureV2(lessonSpec.metadata.content_archetype);

    // Get model from ModelConfigService (database-driven, throws on failure)
    const modelConfigService = createModelConfigService();
    const modelId =
      state.modelOverride ??
      (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        modelId,
        source: state.modelOverride ? 'override' : 'database',
      },
      'Using model config for generator'
    );

    // Create LLM instance for intro and summary generation
    const model = createOpenRouterModel(modelId, temperature, 4096);

    let totalTokens = 0;
    const contentParts: string[] = [];

    // ========================================================================
    // 1. GENERATE INTRODUCTION
    // ========================================================================
    logger.debug({ lessonId: lessonSpec.lesson_id }, 'Generating introduction');
    const introResult = await generateIntroduction(lessonSpec, language, model);
    totalTokens += introResult.tokensUsed;

    // Start building full content
    contentParts.push(`# ${lessonSpec.title}`);
    contentParts.push('');
    contentParts.push(`## ${headers.introduction}`);
    contentParts.push('');
    contentParts.push(introResult.content);
    contentParts.push('');

    // Track accumulated content for context window
    let accumulatedContent = contentParts.join('\n');

    // ========================================================================
    // 2. GENERATE SECTIONS SEQUENTIALLY
    // ========================================================================
    const sectionTitles: string[] = [];

    for (const section of lessonSpec.sections) {
      logger.debug(
        { lessonId: lessonSpec.lesson_id, sectionTitle: section.title },
        'Generating section'
      );

      const sectionResult = await generateSection(
        section,
        lessonSpec,
        ragChunks,
        accumulatedContent, // Pass context window
        language,
        state.modelOverride,
        style // Pass course content style for style-specific prompts
      );

      totalTokens += sectionResult.tokensUsed;
      sectionTitles.push(section.title);

      // =========================================================================
      // MERMAID FIX PIPELINE
      // =========================================================================
      // Run 5-stage cascading fix pipeline:
      // 1. Regex Sanitization - Fast fixes for common LLM issues (escaped quotes, arrows)
      // 2. Validation - Official mermaid.parse() syntax check
      // 3. LLM Fix - Use cheap LLM to fix complex issues (max 5 per lesson)
      // 4. Re-validation - Verify LLM fix worked
      // 5. Fallback - Replace with HTML comment for manual review
      //
      // DEFENSIVE STRATEGY:
      // - Pipeline errors should NOT block lesson generation
      // - If pipeline crashes, use original content (self-reviewer will catch issues)
      // - Trade-off: Some broken diagrams might slip through, but lessons still generate
      // - Rationale: Better to have a lesson with broken diagram than no lesson at all
      // =========================================================================
      let finalContent = sectionResult.content;
      try {
        const pipelineResult = await runMermaidFixPipeline(sectionResult.content);
        if (pipelineResult.modified) {
          logger.debug(
            {
              sectionTitle: section.title,
              metrics: pipelineResult.metrics,
            },
            'Mermaid fix pipeline applied to section'
          );
        }
        finalContent = pipelineResult.content;
      } catch (error) {
        logger.warn(
          {
            sectionTitle: section.title,
            error: error instanceof Error ? error.message : String(error),
          },
          'Mermaid fix pipeline failed, using original content'
        );
        // Keep original content - self-reviewer will catch issues later
      }

      // Validate for prompt template markers
      const validation = validateGeneratedContent(finalContent);
      if (!validation.isValid) {
        logger.error(
          {
            sectionTitle: section.title,
            detectedMarkers: validation.detectedMarkers,
          },
          'Generated content contains prompt template markers - indicates model reproducing training data'
        );

        // For now, log and continue - in future could trigger regeneration
        // throw new Error(`Content generation failed: prompt template leak detected in section "${section.title}"`);
      }

      // Add section to content
      contentParts.push(`## ${section.title}`);
      contentParts.push('');
      contentParts.push(finalContent);
      contentParts.push('');

      // Update accumulated content for next section's context
      accumulatedContent = contentParts.join('\n');

      // Warn if accumulated content is getting very large (>100K chars)
      if (accumulatedContent.length > 100_000) {
        logger.warn(
          {
            lessonId: lessonSpec.lesson_id,
            sectionTitle: section.title,
            accumulatedLength: accumulatedContent.length,
          },
          'Accumulated content exceeds 100K characters - consider breaking into smaller lessons'
        );
      }

      // Log section completion
      await logTrace({
        courseId,
        lessonId: lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'generator',
        stepName: 'generator_section_complete',
        inputData: {
          lessonLabel: lessonSpec.lesson_id,
          sectionTitle: section.title,
          sectionIndex: lessonSpec.sections.indexOf(section) + 1,
          totalSections: lessonSpec.sections.length,
        },
        outputData: {
          contentLength: sectionResult.content.length,
          wordCount: sectionResult.content.split(/\s+/).filter(Boolean).length,
        },
        tokensUsed: sectionResult.tokensUsed,
        durationMs: 0,
      });
    }

    // ========================================================================
    // 3. GENERATE SUMMARY
    // ========================================================================
    logger.debug({ lessonId: lessonSpec.lesson_id }, 'Generating summary');
    const summaryResult = await generateSummary(lessonSpec, sectionTitles, language, model);
    totalTokens += summaryResult.tokensUsed;

    contentParts.push(`## ${headers.summary}`);
    contentParts.push('');
    contentParts.push(summaryResult.content);
    contentParts.push('');

    // ========================================================================
    // 4. GENERATE EXERCISES
    // ========================================================================
    logger.debug({ lessonId: lessonSpec.lesson_id }, 'Generating exercises');
    const exercisesResult = await generateExercises(lessonSpec, sectionTitles, language, model);
    totalTokens += exercisesResult.tokensUsed;

    contentParts.push(`## ${headers.exercises}`);
    contentParts.push('');
    contentParts.push(exercisesResult.content);
    contentParts.push('');

    // ========================================================================
    // 5. ASSEMBLE FINAL CONTENT
    // ========================================================================
    const generatedContent = contentParts.join('\n');
    const durationMs = Math.round(performance.now() - startTime);

    // Calculate metrics
    const wordCount = generatedContent.split(/\s+/).filter(Boolean).length;
    const avgSectionLength = Math.round(generatedContent.length / lessonSpec.sections.length);

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        contentLength: generatedContent.length,
        wordCount,
        sectionsGenerated: sectionTitles.length,
        totalTokens,
        durationMs,
      },
      'Generator node: Serial content generation complete'
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
        sectionsGenerated: sectionTitles.length,
        totalSections: lessonSpec.sections.length,
        avgSectionLength,
        hasIntro: true,
        hasSummary: true,
        hasExercises: true,
        modelUsed: modelId,
      },
      tokensUsed: totalTokens,
      durationMs,
    });

    return {
      generatedContent,
      tokensUsed: totalTokens,
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
      'Generator node: Serial content generation failed'
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
      durationMs,
    };
  }
}
