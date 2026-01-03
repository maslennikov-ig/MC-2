/**
 * Card Enrichment Handler
 * @module stages/stage7-enrichments/handlers/card-handler
 *
 * Single-stage handler for automatic card image generation (1:1 square).
 * Uses GPT-5 Image Mini for cost-effective ($0.007) card generation.
 *
 * Cards are used for:
 * - Course catalog thumbnails
 * - Lesson sidebar/navigation images
 *
 * Visual consistency is maintained through visual_style stored in course settings.
 */

import { logger } from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { CardEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildCourseCardPrompt,
  buildLessonCardPrompt,
  getDefaultCourseCardPrompt,
  getDefaultLessonCardPrompt,
  type CourseCardParams,
  type LessonCardParams,
} from '../prompts/card-prompt';
import {
  generateCardImage,
  base64ToBuffer,
  convertToWebP,
} from '../services/image-generation-service';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Supabase Storage bucket for card images */
const STORAGE_BUCKET = process.env.ENRICHMENTS_STORAGE_BUCKET ?? 'course-enrichments';

/**
 * Retry configuration for upload operations
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Default visual style if none is configured on the course
 */
const DEFAULT_VISUAL_STYLE = {
  colorScheme: 'blue and purple gradients with subtle accents',
  aesthetic: 'modern, professional, clean',
  visualElements: 'abstract geometric shapes, flowing lines',
  mood: 'professional, engaging, educational',
};

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
        'Card upload failed, retrying...'
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Generate localized alt text for card images
 */
function getLocalizedAltText(language: string, title: string, isLesson: boolean): string {
  const safeTitle = title.slice(0, 100);
  const templates: Record<string, { lesson: string; course: string }> = {
    en: {
      lesson: `Card illustration for lesson: ${safeTitle}`,
      course: `Card illustration for course: ${safeTitle}`,
    },
    ru: {
      lesson: `Карточка урока: ${safeTitle}`,
      course: `Карточка курса: ${safeTitle}`,
    },
  };
  const lang = templates[language] ?? templates.en;
  return isLesson ? lang.lesson : lang.course;
}

/**
 * Extract visual style from course settings
 */
function getVisualStyle(course: { visual_style?: unknown; settings?: unknown }): {
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
} {
  // First try dedicated visual_style column
  if (course.visual_style && typeof course.visual_style === 'object') {
    const vs = course.visual_style as Record<string, unknown>;
    if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
      return {
        colorScheme: String(vs.colorScheme),
        aesthetic: String(vs.aesthetic),
        visualElements: String(vs.visualElements),
        mood: String(vs.mood),
      };
    }
  }

  // Fallback to settings.visual_style (legacy)
  if (course.settings && typeof course.settings === 'object') {
    const settings = course.settings as Record<string, unknown>;
    if (settings.visual_style && typeof settings.visual_style === 'object') {
      const vs = settings.visual_style as Record<string, unknown>;
      if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
        return {
          colorScheme: String(vs.colorScheme),
          aesthetic: String(vs.aesthetic),
          visualElements: String(vs.visualElements),
          mood: String(vs.mood),
        };
      }
    }
  }

  return DEFAULT_VISUAL_STYLE;
}

/**
 * Extract learning objectives from lesson content
 */
function extractLessonObjectives(lessonContent: string | null): string[] {
  if (!lessonContent) {
    return [];
  }

  // Try to find learning objectives section
  const objectivesMatch = lessonContent.match(
    /(?:## (?:Learning Objectives?|Цели урока|Objectives?)\s*\n)([\s\S]*?)(?=\n##|$)/i
  );

  if (objectivesMatch) {
    const objectivesText = objectivesMatch[1];
    const bullets = objectivesText.match(/[-*]\s+(.+)/g);
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
      .filter((s) => !s.match(/introduction|summary|conclusion|references|цели|итоги/i))
      .slice(0, 3);
  }

  return [];
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate a card image for course or lesson
 *
 * This is a single-stage automatic generation flow.
 * Uses GPT-5 Image Mini for cost-effective 1024x1024 square images.
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let imageCostUsd = 0;

  // Determine if this is a course card or lesson card
  // Course cards have a special "course_card" marker or no lesson content
  const isCourseCard = !lesson.content || lesson.id === 'course-level';

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      isCourseCard,
    },
    'Card handler: starting card generation'
  );

  try {
    // Get visual style from course
    const visualStyle = getVisualStyle(course);

    // Build appropriate prompt
    let imagePrompt: string;

    if (isCourseCard) {
      // Course card prompt
      const courseCardParams: CourseCardParams = {
        courseTitle: course.title ?? 'Educational Course',
        courseTopic: course.course_description ?? course.title ?? 'Education',
        language: course.language ?? 'en',
        visualStyle,
      };

      try {
        imagePrompt = buildCourseCardPrompt(courseCardParams);
      } catch {
        logger.warn(
          { enrichmentId: enrichment.id },
          'Card handler: failed to build course card prompt, using default'
        );
        imagePrompt = getDefaultCourseCardPrompt(
          course.title ?? 'Educational Course',
          course.course_description ?? 'Education'
        );
      }
    } else {
      // Lesson card prompt
      const lessonObjectives = extractLessonObjectives(lesson.content);

      const lessonCardParams: LessonCardParams = {
        lessonTitle: lesson.title,
        lessonObjectives,
        courseTitle: course.title ?? 'Educational Course',
        courseTopic: course.course_description ?? course.title ?? 'Education',
        visualStyle,
      };

      try {
        imagePrompt = buildLessonCardPrompt(lessonCardParams);
      } catch {
        logger.warn(
          { enrichmentId: enrichment.id },
          'Card handler: failed to build lesson card prompt, using default'
        );
        imagePrompt = getDefaultLessonCardPrompt(
          lesson.title,
          course.title ?? 'Educational Course',
          course.course_description ?? 'Education'
        );
      }
    }

    logger.info(
      {
        enrichmentId: enrichment.id,
        promptLength: imagePrompt.length,
        isCourseCard,
      },
      'Card handler: prompt built'
    );

    // Generate image using GPT-5 Image Mini (1024x1024)
    const imageResult = await generateCardImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        mimeType: imageResult.mimeType,
        dimensions: `${imageResult.width}x${imageResult.height}`,
        costUsd: imageCostUsd,
      },
      'Card handler: image generated'
    );

    // Convert to WebP for smaller file size
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
      'Card handler: converted to WebP'
    );

    // Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const storagePath = isCourseCard
      ? `${course.id}/card.webp`
      : `${course.id}/${lesson.id}/${enrichment.id}.webp`;

    await retryWithBackoff(async () => {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, webpResult.buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload card: ${uploadError.message}`);
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
      'Card handler: image uploaded'
    );

    // Build result
    const durationMs = Date.now() - startTime;

    const content: CardEnrichmentContent = {
      type: 'card',
      imageUrl,
      altText: getLocalizedAltText(
        course.language ?? 'en',
        isCourseCard ? course.title ?? 'Course' : lesson.title,
        !isCourseCard
      ),
      dimensions: {
        width: imageResult.width,
        height: imageResult.height,
      },
      generation_prompt: imagePrompt.slice(0, 500), // Truncate for storage
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      input_tokens: 0, // Image generation doesn't use tokens
      output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: imageCostUsd,
      model_used: imageResult.modelUsed,
      quality_score: 1.0, // No quality scoring for images
      retry_attempts: enrichment.generation_attempt,
      additional_info: {
        card_type: isCourseCard ? 'course' : 'lesson',
        visual_style_source: course.visual_style ? 'visual_style' : 'default',
      },
    };

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        costUsd: imageCostUsd,
        cardType: isCourseCard ? 'course' : 'lesson',
      },
      'Card handler: card generation complete'
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
      'Card handler: generation failed'
    );

    throw new Error(`Card generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Card enrichment handler for automatic 1:1 square image generation
 *
 * Uses single-stage flow (no draft/review phase) for automatic generation.
 * Generates course cards for catalog view and lesson cards for navigation.
 */
export const cardHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
