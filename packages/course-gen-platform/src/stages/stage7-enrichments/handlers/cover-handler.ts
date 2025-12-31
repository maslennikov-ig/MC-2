/**
 * Cover Enrichment Handler
 * @module stages/stage7-enrichments/handlers/cover-handler
 *
 * Single-stage handler for lesson cover image generation.
 * Two-phase internal process:
 * 1. LLM generates optimized image prompt from lesson context
 * 2. Image model generates hero banner image
 *
 * Uses OpenRouter API with bytedance-seed/seedream-4.5 model.
 */

import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import type { CoverEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildCoverPromptSystemPrompt,
  buildCoverPromptUserMessage,
  getDefaultImagePrompt,
  type CoverPromptParams,
} from '../prompts/cover-prompt';
import {
  generateImage,
  base64ToBuffer,
  getExtensionFromMimeType,
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
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

      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
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
// MAIN HANDLER
// ============================================================================

/**
 * Generate a lesson cover image
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
      const prohibitedKeywords = ['nsfw', 'nude', 'explicit', 'gore', 'violence', 'blood'];
      const lowerPrompt = imagePrompt.toLowerCase();
      if (prohibitedKeywords.some(keyword => lowerPrompt.includes(keyword))) {
        logger.warn(
          { enrichmentId: enrichment.id },
          'Cover handler: prohibited content in prompt, using default'
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

    // Phase 3: Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const extension = getExtensionFromMimeType(imageResult.mimeType);
    const storagePath = `${course.id}/${lesson.id}/${enrichment.id}.${extension}`;
    const imageBuffer = base64ToBuffer(imageResult.base64Data);

    // Retry upload up to 3 times with exponential backoff
    await retryWithBackoff(async () => {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, imageBuffer, {
          contentType: imageResult.mimeType,
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

    const content: CoverEnrichmentContent = {
      type: 'cover',
      image_url: imageUrl,
      width: imageResult.width,
      height: imageResult.height,
      aspect_ratio: '16:9',
      generation_prompt: imagePrompt,
      alt_text: 'Generated lesson cover illustration',
      format: extension as 'png' | 'jpeg' | 'webp',
      file_size_bytes: imageBuffer.length,
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
// HANDLER EXPORT
// ============================================================================

/**
 * Cover enrichment handler
 * Single-stage flow: generates image directly without draft phase
 */
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
