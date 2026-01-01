/**
 * Cover Enrichment Handler
 * @module stages/stage7-enrichments/handlers/cover-handler
 *
 * Two-stage handler for lesson cover image generation.
 * Phase 1 (Draft): LLM generates 3 image prompt variants with different visual approaches
 * Phase 2 (Final): Image model generates hero banner from selected variant
 *
 * Uses OpenRouter API with bytedance-seed/seedream-4.5 model for image generation.
 */

import { z } from 'zod';
import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import type { CoverEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult, DraftResult } from '../types';
import {
  buildCoverPromptSystemPrompt,
  buildCoverPromptUserMessage,
  buildCoverPromptVariantsSystemPrompt,
  buildCoverPromptVariantsUserMessage,
  getDefaultImagePrompt,
  type CoverPromptParams,
  type CoverPromptVariant,
} from '../prompts/cover-prompt';
import {
  generateImage,
  base64ToBuffer,
  convertToWebP,
} from '../services/image-generation-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model for generating image prompts (LLM phase) */
const PROMPT_MODEL = DEFAULT_MODEL_ID;

/** Max tokens for prompt generation */
const MAX_PROMPT_TOKENS = 500;

/** Temperature for prompt generation */
const PROMPT_TEMPERATURE = 0.7;

/** Supabase Storage bucket for cover images */
const STORAGE_BUCKET = process.env.ENRICHMENTS_STORAGE_BUCKET ?? 'course-enrichments';

/**
 * Retry configuration for upload operations
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Zod schema for cover prompt variant
 */
const coverPromptVariantSchema = z.object({
  id: z.number().int().min(1).max(3),
  prompt_en: z.string().min(20).max(500),
  description_localized: z.string().min(5).max(200),
});

/**
 * Zod schema for draft variants response from LLM
 */
const coverDraftVariantsSchema = z.object({
  variants: z.array(coverPromptVariantSchema).length(3),
});

/**
 * Cover draft content structure for two-stage flow
 */
export interface CoverDraftContent {
  type: 'cover_draft';
  variants: CoverPromptVariant[];
  selected_variant?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
  initialDelayMs: number = RETRY_CONFIG.INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      const delayMs = initialDelayMs * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
      logger.warn(
        { attempt, delayMs, error: lastError.message },
        'Upload failed, retrying...'
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Generate localized alt text for cover images
 */
function getLocalizedAltText(language: string, lessonTitle: string): string {
  const safeTitle = lessonTitle.slice(0, 100); // Limit length
  const templates: Record<string, string> = {
    en: `Cover illustration for lesson: ${safeTitle}`,
    ru: `Обложка урока: ${safeTitle}`,
  };
  return templates[language] ?? templates.en;
}

/**
 * Patterns for prohibited content in image prompts
 * Uses word boundaries to avoid false positives
 */
const PROHIBITED_PATTERNS = [
  /\bnsfw\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bexplicit\b/i,
  /\bgore\b/i,
  /\bviolence\b/i,
  /\bviolent\b/i,
  /\bblood\b/i,
  /\bbloody\b/i,
  /\bweapon\b/i,
  /\bweapons\b/i,
  /\bdeath\b/i,
  /\bkill\b/i,
] as const;

/**
 * Check if prompt contains prohibited content
 */
function containsProhibitedContent(prompt: string): boolean {
  return PROHIBITED_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Extract keywords from lesson content
 * Attempts to find key topics or generates from section headings
 */
function extractKeywords(lessonContent: string | null): string[] {
  if (!lessonContent) {
    return [];
  }

  // Try to find a "Key Topics" or similar section
  const keyTopicsMatch = lessonContent.match(
    /(?:## (?:Key Topics?|Main Concepts?|Topics Covered?)\s*\n)([\s\S]*?)(?=\n##|$)/i
  );

  if (keyTopicsMatch) {
    const topicsText = keyTopicsMatch[1];
    const bullets = topicsText.match(/[-*]\s+(.+)/g);
    if (bullets && bullets.length > 0) {
      return bullets
        .map((b) => b.replace(/^[-*]\s+/, '').trim())
        .slice(0, 5);
    }
  }

  // Fallback: extract section headings
  const sections = lessonContent.match(/^## (.+)$/gm);
  if (sections && sections.length > 0) {
    return sections
      .map((s) => s.replace(/^## /, '').trim())
      .filter((s) => !s.match(/introduction|summary|conclusion|references/i))
      .slice(0, 5);
  }

  return [];
}

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
async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    },
    'Cover handler: generating draft prompt variants'
  );

  try {
    // Extract keywords from lesson content
    const keywords = extractKeywords(lesson.content);

    const promptParams: CoverPromptParams = {
      lessonTitle: lesson.title,
      keywords,
      courseSubject: course.title ?? 'Educational Content',
      language: (course.language as 'en' | 'ru') || 'en',
    };

    // Build prompts for variant generation
    const systemPrompt = buildCoverPromptVariantsSystemPrompt(promptParams.language);
    const userMessage = buildCoverPromptVariantsUserMessage(promptParams);

    // Generate 3 variants via LLM
    const llmResponse = await llmClient.generateCompletion(
      userMessage,
      {
        model: PROMPT_MODEL,
        systemPrompt,
        maxTokens: MAX_PROMPT_TOKENS * 3, // More tokens for 3 variants
        temperature: PROMPT_TEMPERATURE,
      }
    );

    inputTokens = llmResponse.inputTokens;
    outputTokens = llmResponse.outputTokens;

    // Parse and validate response
    let variants: CoverPromptVariant[];

    try {
      // Clean up potential markdown code blocks
      let jsonContent = llmResponse.content.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonContent);
      const validationResult = coverDraftVariantsSchema.safeParse(parsed);

      if (!validationResult.success) {
        logger.warn(
          {
            enrichmentId: enrichment.id,
            errors: validationResult.error.errors,
          },
          'Cover handler: failed to validate draft variants, using fallback'
        );
        throw new Error('Validation failed');
      }

      variants = validationResult.data.variants;

      // Check for prohibited content in all variants
      for (const variant of variants) {
        if (containsProhibitedContent(variant.prompt_en)) {
          logger.warn(
            {
              enrichmentId: enrichment.id,
              variantId: variant.id,
            },
            'Cover handler: prohibited content in variant, replacing'
          );
          // Replace with default prompt
          variant.prompt_en = getDefaultImagePrompt(lesson.title, course.title ?? 'Educational Content');
        }
      }
    } catch (error) {
      // Fallback: create 3 variations of default prompt
      logger.warn(
        {
          enrichmentId: enrichment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Cover handler: failed to parse variants, using fallback defaults'
      );

      const defaultPrompt = getDefaultImagePrompt(lesson.title, course.title ?? 'Educational Content');

      // Create 3 simple variations
      variants = [
        {
          id: 1,
          prompt_en: defaultPrompt.replace('blue and purple', 'vibrant blue and teal'),
          description_localized: promptParams.language === 'ru'
            ? 'Абстрактная визуализация с синими тонами'
            : 'Abstract visualization with blue tones',
        },
        {
          id: 2,
          prompt_en: defaultPrompt.replace('blue and purple', 'warm orange and coral'),
          description_localized: promptParams.language === 'ru'
            ? 'Иллюстративный стиль с теплыми тонами'
            : 'Illustrative style with warm tones',
        },
        {
          id: 3,
          prompt_en: defaultPrompt.replace('blue and purple', 'professional green and emerald'),
          description_localized: promptParams.language === 'ru'
            ? 'Минималистичный дизайн с зелеными акцентами'
            : 'Minimalist design with green accents',
        },
      ];
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

    // Build draft content
    const draftContent: CoverDraftContent = {
      type: 'cover_draft',
      variants,
      // selected_variant will be set by user in frontend
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

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: draft generation failed'
    );

    throw new Error(`Cover draft generation failed: ${errorMessage}`);
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
  let inputTokens = 0;
  let outputTokens = 0;
  let imageCostUsd = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    },
    'Cover handler: starting cover generation'
  );

  try {
    // Phase 1: Generate image prompt using LLM
    const keywords = extractKeywords(lesson.content);

    const promptParams: CoverPromptParams = {
      lessonTitle: lesson.title,
      keywords,
      courseSubject: course.title ?? 'Educational Content',
      language: (course.language as 'en' | 'ru') || 'en',
    };

    let imagePrompt: string;

    try {
      const systemPrompt = buildCoverPromptSystemPrompt();
      const userMessage = buildCoverPromptUserMessage(promptParams);

      const llmResponse = await llmClient.generateCompletion(
        userMessage,
        {
          model: PROMPT_MODEL,
          systemPrompt,
          maxTokens: MAX_PROMPT_TOKENS,
          temperature: PROMPT_TEMPERATURE,
        }
      );

      imagePrompt = llmResponse.content.trim();
      inputTokens = llmResponse.inputTokens;
      outputTokens = llmResponse.outputTokens;

      // Validate prompt length
      const MIN_PROMPT_LENGTH = 20;
      const MAX_PROMPT_LENGTH = 500;

      if (imagePrompt.length < MIN_PROMPT_LENGTH || imagePrompt.length > MAX_PROMPT_LENGTH) {
        logger.warn(
          {
            enrichmentId: enrichment.id,
            promptLength: imagePrompt.length,
            min: MIN_PROMPT_LENGTH,
            max: MAX_PROMPT_LENGTH,
          },
          'Cover handler: invalid prompt length, using default'
        );
        imagePrompt = getDefaultImagePrompt(lesson.title, course.title ?? 'Educational Content');
      }

      // Check for prohibited content
      if (containsProhibitedContent(imagePrompt)) {
        logger.warn(
          { enrichmentId: enrichment.id },
          'Cover handler: prohibited content detected in LLM-generated prompt, using default'
        );
        imagePrompt = getDefaultImagePrompt(lesson.title, course.title ?? 'Educational Content');
      }

      logger.info(
        {
          enrichmentId: enrichment.id,
          promptLength: imagePrompt.length,
          inputTokens,
          outputTokens,
        },
        'Cover handler: image prompt generated'
      );
    } catch (error) {
      // Fallback to default prompt if LLM fails
      logger.warn(
        {
          enrichmentId: enrichment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Cover handler: LLM failed, using default prompt'
      );

      imagePrompt = getDefaultImagePrompt(lesson.title, course.title ?? 'Educational Content');
    }

    // Phase 2: Generate image
    const imageResult = await generateImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        mimeType: imageResult.mimeType,
        costUsd: imageCostUsd,
      },
      'Cover handler: image generated'
    );

    // Phase 3: Convert to WebP for smaller file size
    const originalBuffer = base64ToBuffer(imageResult.base64Data);
    const webpResult = await convertToWebP(originalBuffer, 85);

    logger.info(
      {
        enrichmentId: enrichment.id,
        originalSize: webpResult.originalSizeBytes,
        webpSize: webpResult.sizeBytes,
        savedBytes: webpResult.originalSizeBytes - webpResult.sizeBytes,
        compressionRatio: webpResult.compressionRatio.toFixed(2),
      },
      'Cover handler: converted to WebP'
    );

    // Phase 4: Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const storagePath = `${course.id}/${lesson.id}/${enrichment.id}.webp`;

    // Retry upload up to 3 times with exponential backoff
    await retryWithBackoff(async () => {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, webpResult.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
    }, 3, 1000);

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    logger.info(
      {
        enrichmentId: enrichment.id,
        storagePath,
        imageUrl,
      },
      'Cover handler: image uploaded'
    );

    // Phase 5: Build result
    const durationMs = Date.now() - startTime;

    const content: CoverEnrichmentContent = {
      type: 'cover',
      image_url: imageUrl,
      width: imageResult.width,
      height: imageResult.height,
      aspect_ratio: '16:9',
      generation_prompt: imagePrompt,
      alt_text: getLocalizedAltText(course.language ?? 'en', lesson.title),
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_usd: imageCostUsd + (inputTokens + outputTokens) * 0.000001, // Approximate LLM cost
      model_used: imageResult.modelUsed,
      quality_score: 1.0, // No quality scoring for images
      retry_attempts: enrichment.generation_attempt,
    };

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        totalCostUsd: metadata.estimated_cost_usd,
      },
      'Cover handler: cover generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: generation failed'
    );

    throw new Error(`Cover generation failed: ${errorMessage}`);
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
async function generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let imageCostUsd = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
    },
    'Cover handler: generating final image from selected variant'
  );

  try {
    // Extract draft content
    const draftContent = draft.draftContent as CoverDraftContent;

    if (!draftContent.selected_variant) {
      throw new Error('No variant selected in draft content');
    }

    // Find the selected variant
    const selectedVariant = draftContent.variants.find(
      (v) => v.id === draftContent.selected_variant
    );

    if (!selectedVariant) {
      throw new Error(
        `Selected variant ${draftContent.selected_variant} not found in draft`
      );
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

    // Phase 1: Generate image from selected prompt
    const imageResult = await generateImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        mimeType: imageResult.mimeType,
        costUsd: imageCostUsd,
      },
      'Cover handler: image generated from variant'
    );

    // Phase 2: Convert to WebP for smaller file size
    const originalBuffer = base64ToBuffer(imageResult.base64Data);
    const webpResult = await convertToWebP(originalBuffer, 85);

    logger.info(
      {
        enrichmentId: enrichment.id,
        originalSize: webpResult.originalSizeBytes,
        webpSize: webpResult.sizeBytes,
        savedBytes: webpResult.originalSizeBytes - webpResult.sizeBytes,
        compressionRatio: webpResult.compressionRatio.toFixed(2),
      },
      'Cover handler: converted to WebP'
    );

    // Phase 3: Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const storagePath = `${course.id}/${lesson.id}/${enrichment.id}.webp`;

    // Retry upload up to 3 times with exponential backoff
    await retryWithBackoff(async () => {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, webpResult.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }
    }, 3, 1000);

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    logger.info(
      {
        enrichmentId: enrichment.id,
        storagePath,
        imageUrl,
      },
      'Cover handler: image uploaded'
    );

    // Phase 4: Build result
    const durationMs = Date.now() - startTime;
    const totalDurationMs = (draft.metadata.durationMs || 0) + durationMs;

    const content: CoverEnrichmentContent = {
      type: 'cover',
      image_url: imageUrl,
      width: imageResult.width,
      height: imageResult.height,
      aspect_ratio: '16:9',
      generation_prompt: imagePrompt,
      alt_text: getLocalizedAltText(course.language ?? 'en', lesson.title),
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: totalDurationMs,
      input_tokens: draft.metadata.tokensUsed ?? 0,
      output_tokens: 0, // Image generation doesn't produce tokens
      total_tokens: draft.metadata.tokensUsed ?? 0,
      estimated_cost_usd: imageCostUsd + (draft.metadata.tokensUsed ?? 0) * 0.000001,
      model_used: imageResult.modelUsed,
      quality_score: 1.0, // No quality scoring for images
      retry_attempts: enrichment.generation_attempt,
      additional_info: {
        selected_variant_id: selectedVariant.id,
        variant_description: selectedVariant.description_localized,
      },
    };

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

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: final generation failed'
    );

    throw new Error(`Cover final generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Cover enrichment handler implementing two-stage flow
 *
 * Stage 1 (Draft): Generate 3 image prompt variants using LLM
 * Stage 2 (Final): Generate cover image from selected variant
 *
 * The handler follows the presentation-handler pattern for two-stage generation.
 */
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generate,
  generateFinal,
};
