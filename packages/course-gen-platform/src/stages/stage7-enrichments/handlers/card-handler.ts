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
import { createPromptService } from '@/shared/prompts/prompt-service';
import {
  uploadEnrichmentAsset,
  uploadCourseCard,
  buildPublicUrl,
} from '../services/unified-storage-service';
import type { CardEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  generateCardImage,
  base64ToBuffer,
  convertToWebP,
} from '../services/image-generation-service';
import { getLessonContent } from '../services/database-service';
import {
  retryWithBackoff,
  getVisualStyle,
  getCardAltText,
  DEFAULT_CARD_VISUAL_STYLE,
} from '../services/enrichment-utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Note: Local storage is now used instead of Supabase Storage
// See: services/local-storage-service.ts

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
      return bullets.map(b => b.replace(/^[-*]\s+/, '').trim()).slice(0, 5);
    }
  }

  // Fallback: extract section headings
  const sections = lessonContent.match(/^## (.+)$/gm);
  if (sections && sections.length > 0) {
    return sections
      .map(s => s.replace(/^## /, '').trim())
      .filter(s => !s.match(/introduction|summary|conclusion|references|цели|итоги/i))
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
    enrichment.title === 'course-card' || enrichment.settings?.isCourseCard === true;

  // Fetch lesson content from lesson_contents table (for lesson cards)
  let lessonContent: string | null = null;
  if (!isCourseCard) {
    lessonContent = await getLessonContent(lesson.id, enrichmentContext.course.id);
  }

  // Log debug if using fallback detection (not a warning - this is normal behavior)
  if (!isCourseCard && (!lessonContent || lesson.id === 'course-level')) {
    logger.debug(
      { enrichmentId: enrichment.id, lessonId: lesson.id, hasContent: !!lessonContent },
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
    const visualStyle = getVisualStyle(course, DEFAULT_CARD_VISUAL_STYLE);

    // Get prompt service (DB with fallback to PROMPT_REGISTRY)
    const promptService = createPromptService();

    // Build appropriate prompt using database templates
    let imagePrompt: string;
    const language = course.language ?? 'en';
    const languageContext =
      language === 'ru'
        ? 'Russian educational content'
        : language === 'en'
          ? 'English educational content'
          : `${language} educational content`;

    if (isCourseCard) {
      // Course card prompt from database
      try {
        imagePrompt = await promptService.renderPrompt('stage7_card_course', {
          courseTitle: course.title || 'Educational Course',
          courseTopic: course.course_description || course.title || 'Education',
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
      const lessonObjectives = extractLessonObjectives(lessonContent);
      const objectivesSummary = lessonObjectives.slice(0, 3).join('; ') || 'Key lesson concepts';

      try {
        imagePrompt = await promptService.renderPrompt('stage7_card_lesson', {
          lessonTitle: lesson.title,
          objectivesSummary,
          courseTitle: course.title || 'Educational Course',
          courseTopic: course.course_description || course.title || 'Education',
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

    // Append custom prompt from user settings if provided
    const customPrompt =
      typeof input.settings?.customPrompt === 'string' ? input.settings.customPrompt : undefined;

    if (customPrompt?.trim()) {
      // Add custom instructions before the no-text requirement
      const noTextSuffix =
        ', absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image';
      if (imagePrompt.includes(noTextSuffix)) {
        // Insert custom prompt before no-text suffix
        imagePrompt = imagePrompt.replace(noTextSuffix, `. ${customPrompt.trim()}${noTextSuffix}`);
      } else {
        // Just append
        imagePrompt += ` ${customPrompt.trim()}`;
      }
      logger.debug(
        { enrichmentId: enrichment.id, customPromptLength: customPrompt.length },
        'Card handler: adding custom prompt to generation'
      );
    }

    logger.info(
      {
        enrichmentId: enrichment.id,
        courseId: course.id,
        lessonId: lesson.id,
        promptLength: imagePrompt.length,
        isCourseCard,
        visualStyleSource: course.visual_style
          ? 'visual_style'
          : course.settings?.visual_style
            ? 'settings'
            : 'default',
        hasCustomPrompt: !!customPrompt?.trim(),
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

    // Upload to local storage with retry
    const storagePath = await retryWithBackoff(
      () =>
        isCourseCard
          ? // Course card: {courseId}/card.webp
            uploadCourseCard(course.id, webpResult.buffer, 'webp')
          : // Lesson card: {courseId}/{lessonId}/{enrichmentId}.webp
            uploadEnrichmentAsset(course.id, lesson.id, enrichment.id, webpResult.buffer, 'webp'),
      3,
      1000,
      'Card upload'
    );

    // Build public URL (nginx serves from /storage/enrichments/)
    const imageUrl = buildPublicUrl(storagePath);

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
      altText: getCardAltText(
        course.language ?? 'en',
        isCourseCard ? (course.title ?? 'Course') : lesson.title,
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
        visualStyleSource: course.visual_style
          ? 'visual_style'
          : course.settings?.visual_style
            ? 'settings'
            : 'default',
      },
      'Card handler: card generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        enrichmentId: enrichment.id,
        courseId: course.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
        stack: errorStack,
      },
      'Card handler: generation failed'
    );

    // Re-throw original error to preserve stack trace
    throw error;
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
