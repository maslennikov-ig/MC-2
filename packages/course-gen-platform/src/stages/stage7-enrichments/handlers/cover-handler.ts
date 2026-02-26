/**
 * Cover Enrichment Handler
 * @module stages/stage7-enrichments/handlers/cover-handler
 *
 * Single-stage handler for lesson cover image generation.
 * User selects style preset (premium3d, realistic, abstract, minimalist, dramatic)
 * before generation. Handler generates image directly using selected style.
 *
 * Flow:
 * 1. User selects style in UI (or uses course default)
 * 2. LLM generates image prompt based on style
 * 3. Image model generates hero banner (16:9)
 * 4. Image converted to WebP and uploaded
 *
 * Uses OpenRouter API with bytedance-seed/seedream-4.5 model for image generation.
 *
 * @see _twoStageReserved for archived two-stage implementation
 */

import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult, DraftResult } from '../types';
import {
  // Types re-exported for external consumers
  type CoverPromptVariant,
  type CoverDraftContent,
  type CoverPromptParams,
  // Configuration
  PROMPT_MODEL,
  MAX_PROMPT_TOKENS,
  PROMPT_TEMPERATURE,
  // Keyword extraction
  extractKeywordsFromLesson,
  // Style resolution
  resolveVisualStyle,
  extractCustomPrompt,
  // Prompt helpers
  getVariantsSystemPrompt,
  getVariantsUserMessage,
  // LLM response parsing
  parseDraftVariantsResponse,
  sanitizeDraftVariants,
  buildFallbackVariants,
  // Image pipeline
  processImagePipeline,
  generateImagePromptViaLLM,
  // Result builders
  buildCoverContent,
  buildGenerateMetadata,
  buildFinalMetadata,
} from './cover-handler-helpers';

// Re-export types for external consumers
export type { CoverPromptVariant, CoverDraftContent };

// ============================================================================
// DRAFT GENERATION (Phase 1)
// ============================================================================

/**
 * Generate 3 cover prompt variants using LLM (draft phase)
 *
 * This is Phase 1 of the two-stage flow. Generates 3 different image prompts
 * with unique visual approaches that can be reviewed and selected before
 * final image generation.
 *
 * @param input - Enrichment handler input with context
 * @returns Draft result with 3 prompt variants
 */
/**
 * Generate 3 cover prompt variants using LLM (draft phase).
 *
 * @deprecated Reserved for potential future two-stage flow revival.
 * Currently unused — single-stage flow is the default.
 * @internal
 */
async function _generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();

  logger.info(
    { enrichmentId: enrichment.id, lessonId: lesson.id, lessonTitle: lesson.title },
    'Cover handler: generating draft prompt variants'
  );

  try {
    // Extract keywords from lesson objectives or content
    const { keywords } = await extractKeywordsFromLesson(
      lesson.id,
      lesson.objectives,
      enrichment.id,
      'draft',
      course.id
    );

    // Resolve visual style from user preset or course defaults
    const visualStyle = resolveVisualStyle(input, course);
    const customPrompt = extractCustomPrompt(input);

    const promptParams: CoverPromptParams = {
      lessonTitle: lesson.title,
      keywords,
      courseSubject: course.title ?? 'Educational Content',
      language: (course.language as 'en' | 'ru') || 'en',
      visualStyle,
      customPrompt,
    };

    logger.debug(
      {
        enrichmentId: enrichment.id,
        visualStyleSource: course.visual_style
          ? 'visual_style'
          : course.settings?.visual_style
            ? 'settings'
            : 'default',
        colorScheme: visualStyle.colorScheme,
      },
      'Cover handler: using visual style for draft generation'
    );

    // Generate 3 variants via LLM
    const systemPrompt = getVariantsSystemPrompt(promptParams.language);
    const userMessage = getVariantsUserMessage(promptParams);

    const llmResponse = await llmClient.generateCompletion(userMessage, {
      model: PROMPT_MODEL,
      systemPrompt,
      maxTokens: MAX_PROMPT_TOKENS * 3,
      temperature: PROMPT_TEMPERATURE,
    });

    const inputTokens = llmResponse.inputTokens;
    const outputTokens = llmResponse.outputTokens;

    // Parse, validate, and sanitize the LLM response
    let variants = parseDraftVariantsResponse(llmResponse.content, enrichment.id);

    if (variants) {
      variants = sanitizeDraftVariants(
        variants,
        enrichment.id,
        lesson.title,
        course.title ?? 'Educational Content',
        visualStyle
      );
    } else {
      variants = buildFallbackVariants(
        lesson.title,
        course.title ?? 'Educational Content',
        promptParams.language,
        visualStyle
      );
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        tokensUsed: inputTokens + outputTokens,
        variantCount: variants.length,
      },
      'Cover handler: draft prompt variants generated'
    );

    const draftContent: CoverDraftContent = {
      type: 'cover_draft',
      variants,
    };

    return {
      draftContent,
      metadata: {
        durationMs,
        tokensUsed: inputTokens + outputTokens,
        modelUsed: PROMPT_MODEL,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        courseId: course.id,
        durationMs,
        error: errorMessage,
        stack: errorStack,
      },
      'Cover handler: draft generation failed'
    );

    throw error;
  }
}

// ============================================================================
// DIRECT GENERATION (Single-stage fallback)
// ============================================================================

/**
 * Generate a lesson cover image directly (single-stage fallback)
 *
 * Used when two-stage flow is bypassed. Generates a single prompt and
 * immediately creates the image.
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();

  logger.info(
    { enrichmentId: enrichment.id, lessonId: lesson.id, lessonTitle: lesson.title },
    'Cover handler: starting cover generation'
  );

  try {
    // Extract keywords from lesson objectives or content
    const { keywords } = await extractKeywordsFromLesson(
      lesson.id,
      lesson.objectives,
      enrichment.id,
      'generation',
      course.id
    );

    // Resolve visual style and custom prompt
    const visualStyle = resolveVisualStyle(input, course);
    const userStyle = typeof input.settings?.style === 'string' ? input.settings.style : undefined;
    const customPrompt = extractCustomPrompt(input);

    logger.debug(
      {
        enrichmentId: enrichment.id,
        visualStyleSource: userStyle
          ? `preset:${userStyle}`
          : course.visual_style
            ? 'visual_style'
            : course.settings?.visual_style
              ? 'settings'
              : 'default',
        colorScheme: visualStyle.colorScheme,
      },
      'Cover handler: using visual style for generation'
    );

    // Phase 1: Generate image prompt using LLM with DB prompts
    const promptResult = await generateImagePromptViaLLM(
      enrichment.id,
      lesson,
      course,
      keywords,
      visualStyle,
      customPrompt
    );

    // Phase 2-4: Generate image, convert, upload
    const pipeline = await processImagePipeline(
      promptResult.imagePrompt,
      course.id,
      lesson.id,
      enrichment.id
    );

    // Phase 5: Build result
    const durationMs = Date.now() - startTime;

    const content = buildCoverContent(
      pipeline,
      promptResult.imagePrompt,
      course.language ?? 'en',
      lesson.title
    );

    const metadata = buildGenerateMetadata(
      durationMs,
      promptResult.inputTokens,
      promptResult.outputTokens,
      pipeline.imageCostUsd,
      pipeline.modelUsed,
      enrichment.generation_attempt
    );

    logger.info(
      { enrichmentId: enrichment.id, durationMs, totalCostUsd: metadata.estimated_cost_usd },
      'Cover handler: cover generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        courseId: course.id,
        durationMs,
        error: errorMessage,
        stack: errorStack,
      },
      'Cover handler: generation failed'
    );

    throw error;
  }
}

// ============================================================================
// FINAL GENERATION (Phase 2)
// ============================================================================

/**
 * Convert approved draft with selected variant to final cover image
 *
 * This is Phase 2 of the two-stage flow. Takes the selected prompt variant
 * from the approved draft and generates the final cover image.
 *
 * @param input - Enrichment handler input
 * @param draft - Approved draft result from Phase 1 with selected variant
 * @returns Generate result with cover image and metadata
 */
// NOTE: generateFinal is kept for potential future two-stage flow revival

async function _generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();

  logger.info(
    { enrichmentId: enrichment.id, lessonId: lesson.id },
    'Cover handler: generating final image from selected variant'
  );

  try {
    const draftContent = draft.draftContent as CoverDraftContent;

    if (!draftContent.selected_variant) {
      throw new Error('No variant selected in draft content');
    }

    const selectedVariant = draftContent.variants.find(v => v.id === draftContent.selected_variant);

    if (!selectedVariant) {
      throw new Error(`Selected variant ${draftContent.selected_variant} not found in draft`);
    }

    const imagePrompt = selectedVariant.prompt_en;

    logger.info(
      {
        enrichmentId: enrichment.id,
        variantId: selectedVariant.id,
        promptLength: imagePrompt.length,
      },
      'Cover handler: using selected variant for image generation'
    );

    // Run the image processing pipeline
    const pipeline = await processImagePipeline(imagePrompt, course.id, lesson.id, enrichment.id);

    // Build result
    const durationMs = Date.now() - startTime;
    const totalDurationMs = (draft.metadata.durationMs || 0) + durationMs;

    const content = buildCoverContent(pipeline, imagePrompt, course.language ?? 'en', lesson.title);

    const metadata = buildFinalMetadata(
      totalDurationMs,
      draft.metadata.tokensUsed ?? 0,
      pipeline.imageCostUsd,
      pipeline.modelUsed,
      enrichment.generation_attempt,
      selectedVariant.id,
      selectedVariant.description_localized
    );

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        totalDurationMs,
        totalCostUsd: metadata.estimated_cost_usd,
      },
      'Cover handler: final cover generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        courseId: course.id,
        durationMs,
        error: errorMessage,
        stack: errorStack,
      },
      'Cover handler: final generation failed'
    );

    throw error;
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Cover enrichment handler implementing single-stage flow
 *
 * Generates cover image directly using style presets and optional custom prompt.
 * User selects style in UI before generation starts (not after draft).
 */
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};

/**
 * @deprecated Reserved for potential future two-stage flow revival.
 * DO NOT USE - Not tested, not maintained, may be removed without notice.
 * @internal
 */
export const _twoStageReserved = { generateDraft: _generateDraft, generateFinal: _generateFinal };
