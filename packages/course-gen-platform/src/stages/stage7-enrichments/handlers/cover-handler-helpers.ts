/**
 * Cover Handler Helpers
 * @module stages/stage7-enrichments/handlers/cover-handler-helpers
 *
 * Extracted helper functions for cover-handler.ts to meet ESLint
 * complexity and max-lines-per-function constraints.
 *
 * Contains:
 * - Keyword extraction from lesson objectives and content
 * - LLM response parsing and validation for draft variants
 * - Image processing pipeline (generate, convert, upload)
 * - Prompt loading from DB with fallback
 * - Content/metadata result builders
 *
 * Long-form prompt templates are in cover-handler-prompts.ts.
 */

import { z } from 'zod';
import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { uploadEnrichmentAsset, buildPublicUrl } from '../services/unified-storage-service';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import type { CoverEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import { generateImage, base64ToBuffer, convertToWebP } from '../services/image-generation-service';
import { getLessonContent } from '../services/database-service';
import {
  retryWithBackoff,
  getVisualStyle,
  getCoverAltText,
  DEFAULT_COVER_VISUAL_STYLE,
  type VisualStyle,
} from '../services/enrichment-utils';
import type { EnrichmentWithContext, EnrichmentHandlerInput } from '../types';

// Re-export prompt-related functions and types from the prompts module
export {
  type CoverPromptParams,
  STYLE_PRESETS,
  getDefaultCoverSystemPrompt,
  getDefaultImagePrompt,
  getVariantsSystemPrompt,
  getVariantsUserMessage,
  buildFallbackUserMessage,
} from './cover-handler-prompts';

// Import for local use
import {
  STYLE_PRESETS,
  getDefaultImagePrompt,
  getDefaultCoverSystemPrompt,
  buildFallbackUserMessage,
} from './cover-handler-prompts';

// ============================================================================
// CONSTANTS
// ============================================================================

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_BASE_DELAY_MS = 1000;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Single cover prompt variant
 */
export interface CoverPromptVariant {
  id: number;
  prompt_en: string;
  description_localized: string;
}

/**
 * Cover draft content structure for two-stage flow
 */
export interface CoverDraftContent {
  type: 'cover_draft';
  variants: CoverPromptVariant[];
  selected_variant?: number;
}

/** Keyword extraction result */
export interface KeywordExtractionResult {
  keywords: string[];
  keywordSource: 'objectives' | 'content' | 'none';
}

/** Image processing pipeline result */
export interface ImagePipelineResult {
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  modelUsed: string;
  imageCostUsd: number;
}

/** Prompt generation result from LLM */
export interface PromptGenerationResult {
  imagePrompt: string;
  inputTokens: number;
  outputTokens: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model for generating image prompts (LLM phase) */
export const PROMPT_MODEL = DEFAULT_MODEL_ID;

/** Max tokens for prompt generation */
export const MAX_PROMPT_TOKENS = 500;

/** Temperature for prompt generation */
export const PROMPT_TEMPERATURE = 0.7;

// ============================================================================
// SCHEMAS
// ============================================================================

const coverPromptVariantSchema = z.object({
  id: z.number().int().min(1).max(3),
  prompt_en: z.string().min(20).max(800),
  description_localized: z.string().min(5).max(200),
});

const coverDraftVariantsSchema = z.object({
  variants: z.array(coverPromptVariantSchema).length(3),
});

// ============================================================================
// PROHIBITED CONTENT DETECTION
// ============================================================================

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

/** Check if prompt contains prohibited content */
export function containsProhibitedContent(prompt: string): boolean {
  return PROHIBITED_PATTERNS.some(pattern => pattern.test(prompt));
}

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/** Extract keywords from lesson content (headings or bullet points) */
function extractKeywords(lessonContent: string | null): string[] {
  if (!lessonContent) return [];

  const keyTopicsMatch = lessonContent.match(
    /(?:## (?:Key Topics?|Main Concepts?|Topics Covered?)\s*\n)([\s\S]*?)(?=\n##|$)/i
  );

  if (keyTopicsMatch) {
    const bullets = keyTopicsMatch[1].match(/[-*]\s+(.+)/g);
    if (bullets && bullets.length > 0) {
      return bullets.map(b => b.replace(/^[-*]\s+/, '').trim()).slice(0, 5);
    }
  }

  const sections = lessonContent.match(/^## (.+)$/gm);
  if (sections && sections.length > 0) {
    return sections
      .map(s => s.replace(/^## /, '').trim())
      .filter(s => !s.match(/introduction|summary|conclusion|references/i))
      .slice(0, 5);
  }

  return [];
}

/** Extract keywords from lesson objectives (primary source) */
function extractKeywordsFromObjectives(objectives: string[] | null): string[] {
  if (!objectives || objectives.length === 0) return [];
  return objectives.slice(0, 5);
}

/**
 * Extract keywords from lesson, using objectives first, then content fallback.
 * Shared logic between _generateDraft and generate.
 */
export async function extractKeywordsFromLesson(
  lessonId: string,
  objectives: string[] | null,
  enrichmentId: string,
  context: 'draft' | 'generation'
): Promise<KeywordExtractionResult> {
  const lessonContent = await getLessonContent(lessonId);

  if (objectives && objectives.length > 0) {
    const keywords = extractKeywordsFromObjectives(objectives);
    logger.debug(
      {
        enrichmentId,
        keywordSource: 'objectives',
        keywordCount: keywords.length,
        objectivesCount: objectives.length,
      },
      `Cover handler: using objectives for keyword extraction for ${context}`
    );
    return { keywords, keywordSource: 'objectives' };
  }

  if (lessonContent) {
    const keywords = extractKeywords(lessonContent);
    logger.debug(
      { enrichmentId, keywordSource: 'content', keywordCount: keywords.length },
      `Cover handler: objectives not available, using content for keywords for ${context}`
    );
    return { keywords, keywordSource: 'content' };
  }

  logger.warn(
    { enrichmentId, lessonId, hasObjectives: !!objectives, hasContent: !!lessonContent },
    `Cover handler: no keyword sources available - using default prompt for ${context}`
  );
  return { keywords: [], keywordSource: 'none' };
}

// ============================================================================
// STYLE RESOLUTION
// ============================================================================

/** Get visual style based on user-selected style preset */
export function getStylePreset(
  styleName: string | undefined,
  courseVisualStyle: VisualStyle
): VisualStyle {
  if (styleName && STYLE_PRESETS[styleName]) return STYLE_PRESETS[styleName];
  return courseVisualStyle;
}

/** Resolve the visual style from input settings and course data */
export function resolveVisualStyle(
  input: EnrichmentHandlerInput,
  course: EnrichmentWithContext['course']
): VisualStyle {
  const courseVisualStyle = getVisualStyle(course, DEFAULT_COVER_VISUAL_STYLE);
  const userStyle = typeof input.settings?.style === 'string' ? input.settings.style : undefined;
  return getStylePreset(userStyle, courseVisualStyle);
}

/** Extract custom prompt from input settings if provided */
export function extractCustomPrompt(input: EnrichmentHandlerInput): string | undefined {
  return typeof input.settings?.customPrompt === 'string' ? input.settings.customPrompt : undefined;
}

// ============================================================================
// LLM RESPONSE PARSING (for draft variants)
// ============================================================================

/** Parse and validate LLM response for draft variants. Returns null on failure. */
export function parseDraftVariantsResponse(
  rawContent: string,
  enrichmentId: string
): CoverPromptVariant[] | null {
  try {
    let jsonContent = rawContent.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent) as unknown;
    const validationResult = coverDraftVariantsSchema.safeParse(parsed);

    if (!validationResult.success) {
      logger.warn(
        { enrichmentId, errors: validationResult.error.errors },
        'Cover handler: failed to validate draft variants, using fallback'
      );
      return null;
    }

    return validationResult.data.variants;
  } catch (error) {
    logger.warn(
      { enrichmentId, error: error instanceof Error ? error.message : 'Unknown error' },
      'Cover handler: failed to parse variants, using fallback defaults'
    );
    return null;
  }
}

/** Sanitize variants by replacing any with prohibited content */
export function sanitizeDraftVariants(
  variants: CoverPromptVariant[],
  enrichmentId: string,
  lessonTitle: string,
  courseTitle: string,
  visualStyle: VisualStyle
): CoverPromptVariant[] {
  for (const variant of variants) {
    if (containsProhibitedContent(variant.prompt_en)) {
      logger.warn(
        { enrichmentId, variantId: variant.id },
        'Cover handler: prohibited content in variant, replacing'
      );
      variant.prompt_en = getDefaultImagePrompt(lessonTitle, courseTitle, visualStyle);
    }
  }
  return variants;
}

/** Build fallback variants when LLM parsing fails */
export function buildFallbackVariants(
  lessonTitle: string,
  courseTitle: string,
  language: 'en' | 'ru',
  visualStyle: VisualStyle
): CoverPromptVariant[] {
  const defaultPrompt = getDefaultImagePrompt(lessonTitle, courseTitle, visualStyle);
  return [
    {
      id: 1,
      prompt_en: defaultPrompt,
      description_localized:
        language === 'ru'
          ? `Абстрактная визуализация с ${visualStyle.colorScheme}`
          : `Abstract visualization with ${visualStyle.colorScheme}`,
    },
    {
      id: 2,
      prompt_en: defaultPrompt.replace('abstract visualization', 'metaphorical illustration'),
      description_localized:
        language === 'ru'
          ? `Иллюстративный стиль: ${visualStyle.aesthetic}`
          : `Illustrative style: ${visualStyle.aesthetic}`,
    },
    {
      id: 3,
      prompt_en: defaultPrompt.replace('abstract visualization', 'minimalist design'),
      description_localized:
        language === 'ru'
          ? `Минималистичный дизайн: ${visualStyle.mood}`
          : `Minimalist design: ${visualStyle.mood}`,
    },
  ];
}

// ============================================================================
// IMAGE PROCESSING PIPELINE
// ============================================================================

/**
 * Run the image processing pipeline: generate, convert to WebP, upload, return URL.
 */
export async function processImagePipeline(
  imagePrompt: string,
  courseId: string,
  lessonId: string,
  enrichmentId: string
): Promise<ImagePipelineResult> {
  const imageResult = await generateImage(imagePrompt);
  logger.info(
    { enrichmentId, mimeType: imageResult.mimeType, costUsd: imageResult.costUsd },
    'Cover handler: image generated'
  );

  const originalBuffer = base64ToBuffer(imageResult.base64Data);
  const webpResult = await convertToWebP(originalBuffer, 85);
  logger.info(
    {
      enrichmentId,
      originalSize: webpResult.originalSizeBytes,
      webpSize: webpResult.sizeBytes,
      compressionRatio: webpResult.compressionRatio.toFixed(2),
    },
    'Cover handler: converted to WebP'
  );

  let storagePath: string;
  try {
    storagePath = await retryWithBackoff(
      () => uploadEnrichmentAsset(courseId, lessonId, enrichmentId, webpResult.buffer, 'webp'),
      UPLOAD_MAX_RETRIES,
      UPLOAD_BASE_DELAY_MS,
      'Cover upload'
    );
  } catch (uploadError) {
    logger.error(
      {
        enrichmentId,
        courseId,
        lessonId,
        error: uploadError instanceof Error ? uploadError.message : String(uploadError),
        sizeBytes: webpResult.sizeBytes,
      },
      'Cover handler: upload failed after all retries'
    );
    throw uploadError;
  }

  const imageUrl = buildPublicUrl(storagePath);
  logger.info({ enrichmentId, storagePath, imageUrl }, 'Cover handler: image uploaded');

  return {
    imageUrl,
    storagePath,
    width: imageResult.width,
    height: imageResult.height,
    sizeBytes: webpResult.sizeBytes,
    modelUsed: imageResult.modelUsed,
    imageCostUsd: imageResult.costUsd,
  };
}

// ============================================================================
// PROMPT GENERATION VIA DB SERVICE
// ============================================================================

/** Load system and user prompts from DB, with hardcoded fallback */
async function loadPromptsFromDB(
  enrichmentId: string,
  lesson: EnrichmentWithContext['lesson'],
  course: EnrichmentWithContext['course'],
  keywords: string[],
  visualStyle: VisualStyle
): Promise<{ systemPrompt: string; userMessage: string }> {
  const promptService = createPromptService();
  const language = (course.language as 'en' | 'ru') || 'en';
  const languageContext =
    language === 'ru' ? 'Russian educational content' : 'English educational content';

  try {
    const systemPromptResult = await promptService.getPrompt('stage7_cover_system');
    const systemPrompt = systemPromptResult?.promptTemplate ?? getDefaultCoverSystemPrompt();

    const userMessage = await promptService.renderPrompt('stage7_cover_user', {
      lessonTitle: lesson.title,
      courseSubject: course.title ?? 'Educational Content',
      keywords: keywords.length > 0 ? keywords.join(', ') : 'general concepts',
      languageContext,
      styleHint: '',
      colorScheme: visualStyle.colorScheme,
      aesthetic: visualStyle.aesthetic,
      visualElements: visualStyle.visualElements,
      mood: visualStyle.mood,
    });

    return { systemPrompt, userMessage };
  } catch (dbError) {
    logger.warn(
      { enrichmentId, error: dbError instanceof Error ? dbError.message : 'Unknown error' },
      'Cover handler: DB prompt lookup failed, using hardcoded fallback'
    );
    return {
      systemPrompt: getDefaultCoverSystemPrompt(),
      userMessage: buildFallbackUserMessage(
        lesson.title,
        course.title ?? 'Educational Content',
        keywords,
        visualStyle
      ),
    };
  }
}

/** Validate and sanitize an LLM-generated image prompt */
function validateImagePrompt(
  imagePrompt: string,
  enrichmentId: string,
  lessonTitle: string,
  courseTitle: string,
  visualStyle: VisualStyle
): string {
  const MIN_PROMPT_LENGTH = 20;
  const MAX_PROMPT_LENGTH = 800;

  if (imagePrompt.length < MIN_PROMPT_LENGTH || imagePrompt.length > MAX_PROMPT_LENGTH) {
    logger.warn(
      {
        enrichmentId,
        promptLength: imagePrompt.length,
        min: MIN_PROMPT_LENGTH,
        max: MAX_PROMPT_LENGTH,
      },
      'Cover handler: invalid prompt length, using default'
    );
    return getDefaultImagePrompt(lessonTitle, courseTitle, visualStyle);
  }

  if (containsProhibitedContent(imagePrompt)) {
    logger.warn(
      { enrichmentId },
      'Cover handler: prohibited content detected in LLM-generated prompt, using default'
    );
    return getDefaultImagePrompt(lessonTitle, courseTitle, visualStyle);
  }

  return imagePrompt;
}

/**
 * Generate image prompt via LLM using DB-stored prompts with fallback.
 */
export async function generateImagePromptViaLLM(
  enrichmentId: string,
  lesson: EnrichmentWithContext['lesson'],
  course: EnrichmentWithContext['course'],
  keywords: string[],
  visualStyle: VisualStyle,
  customPrompt: string | undefined
): Promise<PromptGenerationResult> {
  const { systemPrompt, userMessage: baseMessage } = await loadPromptsFromDB(
    enrichmentId,
    lesson,
    course,
    keywords,
    visualStyle
  );

  // Append custom prompt from user settings if provided
  let userMessage = baseMessage;
  if (customPrompt?.trim()) {
    userMessage += `\n\n## Additional User Instructions (MUST be incorporated):\n${customPrompt.trim()}`;
    logger.debug(
      { enrichmentId, customPromptLength: customPrompt.length },
      'Cover handler: adding custom prompt to generation'
    );
  }

  try {
    const llmResponse = await llmClient.generateCompletion(userMessage, {
      model: PROMPT_MODEL,
      systemPrompt,
      maxTokens: MAX_PROMPT_TOKENS,
      temperature: PROMPT_TEMPERATURE,
    });

    const courseTitle = course.title ?? 'Educational Content';
    const imagePrompt = validateImagePrompt(
      llmResponse.content.trim(),
      enrichmentId,
      lesson.title,
      courseTitle,
      visualStyle
    );

    logger.info(
      {
        enrichmentId,
        promptLength: imagePrompt.length,
        inputTokens: llmResponse.inputTokens,
        outputTokens: llmResponse.outputTokens,
      },
      'Cover handler: image prompt generated'
    );

    return {
      imagePrompt,
      inputTokens: llmResponse.inputTokens,
      outputTokens: llmResponse.outputTokens,
    };
  } catch (llmError) {
    logger.warn(
      { enrichmentId, error: llmError instanceof Error ? llmError.message : 'Unknown error' },
      'Cover handler: LLM generation failed, using default prompt'
    );
    return {
      imagePrompt: getDefaultImagePrompt(
        lesson.title,
        course.title ?? 'Educational Content',
        visualStyle
      ),
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

// ============================================================================
// RESULT BUILDERS
// ============================================================================

/** Build CoverEnrichmentContent from pipeline result and prompt */
export function buildCoverContent(
  pipeline: ImagePipelineResult,
  imagePrompt: string,
  language: string,
  lessonTitle: string
): CoverEnrichmentContent {
  return {
    type: 'cover',
    imageUrl: pipeline.imageUrl,
    dimensions: { width: pipeline.width, height: pipeline.height },
    aspectRatio: '21:9',
    generation_prompt: imagePrompt,
    altText: getCoverAltText(language, lessonTitle),
    format: 'webp',
    file_size_bytes: pipeline.sizeBytes,
  };
}

/** Build EnrichmentMetadata for single-stage generation */
export function buildGenerateMetadata(
  durationMs: number,
  inputTokens: number,
  outputTokens: number,
  imageCostUsd: number,
  modelUsed: string,
  generationAttempt: number
): EnrichmentMetadata {
  return {
    generated_at: new Date().toISOString(),
    generation_duration_ms: durationMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated_cost_usd: imageCostUsd + (inputTokens + outputTokens) * 0.000001,
    model_used: modelUsed,
    quality_score: 1.0,
    retry_attempts: generationAttempt,
  };
}

/** Build EnrichmentMetadata for two-stage final generation */
export function buildFinalMetadata(
  totalDurationMs: number,
  tokensUsed: number,
  imageCostUsd: number,
  modelUsed: string,
  generationAttempt: number,
  selectedVariantId: number,
  variantDescription: string
): EnrichmentMetadata {
  return {
    generated_at: new Date().toISOString(),
    generation_duration_ms: totalDurationMs,
    input_tokens: tokensUsed,
    output_tokens: 0,
    total_tokens: tokensUsed,
    estimated_cost_usd: imageCostUsd + tokensUsed * 0.000001,
    model_used: modelUsed,
    quality_score: 1.0,
    retry_attempts: generationAttempt,
    additional_info: {
      selected_variant_id: selectedVariantId,
      variant_description: variantDescription,
    },
  };
}
