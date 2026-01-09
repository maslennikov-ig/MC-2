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
import { createPromptService } from '@/shared/prompts/prompt-service';
import type { CardEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
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
if (!process.env.ENRICHMENTS_STORAGE_BUCKET) {
  logger.warn('ENRICHMENTS_STORAGE_BUCKET not set, using default: course-enrichments');
}

/**
 * Retry configuration for card generation operations
 *
 * Used for upload retries with exponential backoff
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
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
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns Result of the function
 * @throws Last error if all retries fail
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
 * Alt text templates for card images - all 19 supported languages
 */
const CARD_ALT_TEMPLATES: Record<string, { lesson: string; course: string }> = {
  en: { lesson: 'Card for lesson:', course: 'Card for course:' },
  ru: { lesson: 'Карточка урока:', course: 'Карточка курса:' },
  zh: { lesson: '课程卡片:', course: '课程卡片:' },
  es: { lesson: 'Tarjeta de lección:', course: 'Tarjeta del curso:' },
  fr: { lesson: 'Carte de leçon:', course: 'Carte de cours:' },
  de: { lesson: 'Lektionskarte:', course: 'Kurskarte:' },
  ja: { lesson: 'レッスンカード:', course: 'コースカード:' },
  ko: { lesson: '수업 카드:', course: '코스 카드:' },
  ar: { lesson: 'بطاقة الدرس:', course: 'بطاقة الدورة:' },
  pt: { lesson: 'Cartão da lição:', course: 'Cartão do curso:' },
  it: { lesson: 'Scheda della lezione:', course: 'Scheda del corso:' },
  tr: { lesson: 'Ders kartı:', course: 'Kurs kartı:' },
  vi: { lesson: 'Thẻ bài học:', course: 'Thẻ khóa học:' },
  th: { lesson: 'การ์ดบทเรียน:', course: 'การ์ดหลักสูตร:' },
  id: { lesson: 'Kartu pelajaran:', course: 'Kartu kursus:' },
  ms: { lesson: 'Kad pelajaran:', course: 'Kad kursus:' },
  hi: { lesson: 'पाठ कार्ड:', course: 'कोर्स कार्ड:' },
  bn: { lesson: 'পাঠ কার্ড:', course: 'কোর্স কার্ড:' },
  pl: { lesson: 'Karta lekcji:', course: 'Karta kursu:' },
};

/**
 * Get localized alt text for card images
 *
 * @param language - Language code (e.g., 'ru', 'en')
 * @param title - Course or lesson title
 * @param isLesson - Whether this is a lesson card or course card
 * @returns Localized alt text string
 */
function getLocalizedAltText(language: string, title: string, isLesson: boolean): string {
  const safeTitle = title.slice(0, 100);
  const templates = CARD_ALT_TEMPLATES[language] ?? CARD_ALT_TEMPLATES.en;
  const prefix = isLesson ? templates.lesson : templates.course;
  return `${prefix} ${safeTitle}`;
}

/**
 * Extract visual style from course data
 *
 * Retrieves the visual style from course.visual_style column,
 * falling back to course.settings.visual_style for legacy courses.
 *
 * @param course - Course data with visual_style and settings
 * @returns Visual style object or null if not found
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
 * Extract learning objectives from lesson specification
 *
 * Parses the lesson content or specification to find learning objectives
 * for use in card image generation prompts.
 *
 * @param lesson - Lesson data with content and specification
 * @returns Array of learning objective strings (max 3)
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

/**
 * Get default card prompt when DB/PROMPT_REGISTRY unavailable
 * Provides inline fallback for backward compatibility
 */
function getDefaultCardPrompt(
  title: string,
  description: string,
  type: 'course' | 'lesson'
): string {
  if (type === 'course') {
    return `A stunning abstract 1:1 square thumbnail representing "${title}" in the context of ${description}. Modern digital art style with flowing gradients in professional tones. Clean geometric shapes creating depth and visual interest, centered composition optimized for thumbnail display. Professional educational aesthetic, visually striking at small sizes, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
  }
  return `A professional 1:1 square thumbnail for the lesson "${title}" within the course context of ${description}. Abstract visualization with symbolic representation of the lesson topic. Modern digital art with clean composition, centered focal point, harmonious with course visual style. Optimized for sidebar display at small sizes, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
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
  // Use explicit markers as source of truth, remove overly broad conditions
  const isCourseCard =
    enrichment.title === 'course-card' ||
    enrichment.settings?.isCourseCard === true;

  // Log debug if using fallback detection (not a warning - this is normal behavior)
  if (!isCourseCard && (!lesson.content || lesson.id === 'course-level')) {
    logger.debug(
      { enrichmentId: enrichment.id, lessonId: lesson.id, hasContent: !!lesson.content },
      'Card enrichment for lesson without content - using lesson card prompt'
    );
  }

  logger.info(
    {
      enrichmentId: enrichment.id,
      courseId: course.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      isCourseCard,
    },
    'Card handler: starting card generation'
  );

  try {
    // Get visual style from course
    const visualStyle = getVisualStyle(course);

    // Get prompt service (DB with fallback to PROMPT_REGISTRY)
    const promptService = createPromptService();

    // Build appropriate prompt using database templates
    let imagePrompt: string;
    const language = course.language ?? 'en';
    const languageContext = language === 'ru'
      ? 'Russian educational content'
      : language === 'en'
        ? 'English educational content'
        : `${language} educational content`;

    if (isCourseCard) {
      // Course card prompt from database
      try {
        imagePrompt = await promptService.renderPrompt('stage7_card_course', {
          courseTitle: course.title ?? 'Educational Course',
          courseTopic: course.course_description ?? course.title ?? 'Education',
          languageContext,
          colorScheme: visualStyle.colorScheme,
          aesthetic: visualStyle.aesthetic,
          visualElements: visualStyle.visualElements,
          mood: visualStyle.mood,
        });
      } catch (err) {
        logger.warn(
          { enrichmentId: enrichment.id, error: err },
          'Card handler: failed to render course card prompt from DB, using inline fallback'
        );
        imagePrompt = getDefaultCardPrompt(
          course.title ?? 'Educational Course',
          course.course_description ?? 'Education',
          'course'
        );
      }
    } else {
      // Lesson card prompt from database
      const lessonObjectives = extractLessonObjectives(lesson.content);
      const objectivesSummary = lessonObjectives.slice(0, 3).join('; ') || 'Key lesson concepts';

      try {
        imagePrompt = await promptService.renderPrompt('stage7_card_lesson', {
          lessonTitle: lesson.title,
          objectivesSummary,
          courseTitle: course.title ?? 'Educational Course',
          courseTopic: course.course_description ?? course.title ?? 'Education',
          colorScheme: visualStyle.colorScheme,
          aesthetic: visualStyle.aesthetic,
          visualElements: visualStyle.visualElements,
          mood: visualStyle.mood,
        });
      } catch (err) {
        logger.warn(
          { enrichmentId: enrichment.id, error: err },
          'Card handler: failed to render lesson card prompt from DB, using inline fallback'
        );
        imagePrompt = getDefaultCardPrompt(
          lesson.title,
          `${course.title ?? 'Educational Course'} (${course.course_description ?? 'Education'})`,
          'lesson'
        );
      }
    }

    logger.info(
      {
        enrichmentId: enrichment.id,
        courseId: course.id,
        lessonId: lesson.id,
        promptLength: imagePrompt.length,
        isCourseCard,
        visualStyleSource: course.visual_style ? 'visual_style' : (course.settings?.visual_style ? 'settings' : 'default'),
      },
      'Card handler: prompt built'
    );

    // Generate image using GPT-5 Image Mini (1024x1024)
    const imageResult = await generateCardImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        courseId: course.id,
        lessonId: lesson.id,
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
        courseId: course.id,
        lessonId: lesson.id,
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
        courseId: course.id,
        lessonId: lesson.id,
        durationMs,
        costUsd: imageCostUsd,
        cardType: isCourseCard ? 'course' : 'lesson',
        visualStyleSource: course.visual_style ? 'visual_style' : (course.settings?.visual_style ? 'settings' : 'default'),
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
        courseId: course.id,
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
