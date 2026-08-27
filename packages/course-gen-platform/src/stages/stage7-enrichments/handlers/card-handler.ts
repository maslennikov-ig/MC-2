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
  courseCardStoragePath,
  assetExists,
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
/**
 * Where the course's look came from, in one place.
 *
 * This was written out three times with two different answers: the two log lines distinguished
 * `visual_style` / `settings` / `default`, while the metadata field recorded only
 * `visual_style` / `default` — so a course styled through `settings.visual_style` was LOGGED as
 * settings-styled and STORED as unstyled. The stored value is the one a later question is
 * answered from, and it was the wrong one.
 */
function describeVisualStyleSource(course: {
  visual_style?: unknown;
  settings?: { visual_style?: unknown } | null;
}): 'visual_style' | 'settings' | 'default' {
  if (course.visual_style) return 'visual_style';
  if (course.settings?.visual_style) return 'settings';
  return 'default';
}

/**
 * Render a card prompt from the database, falling back to the inline default.
 *
 * The database copy is the one an editor can change without a deploy; the inline one exists so
 * that a missing or malformed row costs a plainer card rather than the whole enrichment. Both
 * card kinds did this identically and are now one call.
 */
async function renderCardPrompt(input: {
  templateKey: 'stage7_card_course' | 'stage7_card_lesson';
  variables: Record<string, string>;
  fallback: () => string;
  enrichmentId: string;
  kind: 'course' | 'lesson';
}): Promise<string> {
  const { templateKey, variables, fallback, enrichmentId, kind } = input;
  try {
    return await createPromptService().renderPrompt(templateKey, variables);
  } catch (err) {
    logger.warn(
      { enrichmentId, error: err },
      `Card handler: failed to render ${kind} card prompt from DB, using inline fallback`
    );
    return fallback();
  }
}

/**
 * The user's own instructions, spliced in where they still apply.
 *
 * Before the no-text clause, not after it: the models honour the last instruction most, and a
 * custom prompt appended after "absolutely no text" reliably brought the text back.
 */
function applyCustomPrompt(imagePrompt: string, customPrompt: string): string {
  const noTextSuffix =
    ', absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image';

  return imagePrompt.includes(noTextSuffix)
    ? imagePrompt.replace(noTextSuffix, `. ${customPrompt}${noTextSuffix}`)
    : `${imagePrompt} ${customPrompt}`;
}

/**
 * The course's own card, for a lesson card to be drawn in the family of.
 *
 * A course kept its look together by *describing* it: `visual_style` became four
 * lines of prose in the prompt, and every card was drawn from that description
 * having never seen a sibling. Two cards could satisfy every word — "blue and
 * purple gradients", "abstract geometric shapes" — and still look like they came
 * from different products. The model now gets shown the thing instead.
 *
 * Every failure here returns `undefined`. A reference is an improvement to a
 * card, never a reason not to have one: a course whose own card has not been
 * generated yet is the ordinary case for the first card in a run, and a storage
 * hiccup must not cost a lesson its image.
 */
async function loadCourseCardReference(courseId: string): Promise<string | undefined> {
  try {
    const storagePath = courseCardStoragePath(courseId);
    if (!(await assetExists(storagePath))) return undefined;

    const response = await fetch(buildPublicUrl(storagePath));
    if (!response.ok) return undefined;

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') ?? 'image/webp';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    logger.debug({ courseId, error: err }, 'Card handler: no course card to reference');
    return undefined;
  }
}

/** The full image prompt for one card: database template, inline fallback, user additions. */
async function buildCardPrompt(
  input: EnrichmentHandlerInput,
  context: { isCourseCard: boolean; lessonContent: string | null }
): Promise<string> {
  const { enrichment, lesson, course } = input.enrichmentContext;
  const { isCourseCard } = context;

  const visualStyle = getVisualStyle(course, DEFAULT_CARD_VISUAL_STYLE);
  const language = course.language ?? 'en';
  const languageContext =
    language === 'ru'
      ? 'Russian educational content'
      : language === 'en'
        ? 'English educational content'
        : `${language} educational content`;

  const styleVariables = {
    languageContext,
    colorScheme: visualStyle.colorScheme,
    aesthetic: visualStyle.aesthetic,
    visualElements: visualStyle.visualElements,
    mood: visualStyle.mood,
  };
  const courseTitle = course.title || 'Educational Course';
  const courseTopic = course.course_description || course.title || 'Education';

  let imagePrompt: string;
  if (isCourseCard) {
    imagePrompt = await renderCardPrompt({
      templateKey: 'stage7_card_course',
      variables: { courseTitle, courseTopic, ...styleVariables },
      fallback: () =>
        getDefaultCardPrompt(
          course.title ?? 'Educational Course',
          course.course_description ?? 'Education',
          'course'
        ),
      enrichmentId: enrichment.id,
      kind: 'course',
    });
  } else {
    const lessonObjectives = extractLessonObjectives(context.lessonContent);
    const objectivesSummary = lessonObjectives.slice(0, 3).join('; ') || 'Key lesson concepts';

    imagePrompt = await renderCardPrompt({
      templateKey: 'stage7_card_lesson',
      variables: {
        lessonTitle: lesson.title,
        objectivesSummary,
        courseTitle,
        courseTopic,
        ...styleVariables,
      },
      fallback: () =>
        getDefaultCardPrompt(
          lesson.title,
          `${course.title ?? 'Educational Course'} (${course.course_description ?? 'Education'})`,
          'lesson'
        ),
      enrichmentId: enrichment.id,
      kind: 'lesson',
    });
  }

  const customPrompt =
    typeof input.settings?.customPrompt === 'string' ? input.settings.customPrompt.trim() : '';

  if (customPrompt) {
    imagePrompt = applyCustomPrompt(imagePrompt, customPrompt);
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
      visualStyleSource: describeVisualStyleSource(course),
      hasCustomPrompt: Boolean(customPrompt),
    },
    'Card handler: prompt built'
  );

  return imagePrompt;
}

async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();

  // Determine if this is a course card or lesson card
  // Use explicit markers as source of truth, remove overly broad conditions
  const isCourseCard =
    enrichment.title === 'course-card' || enrichment.settings?.isCourseCard === true;

  // Fetch lesson content from lesson_contents table (for lesson cards)
  const lessonContent = isCourseCard
    ? null
    : await getLessonContent(lesson.id, enrichmentContext.course.id);

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
    const imagePrompt = await buildCardPrompt(input, { isCourseCard, lessonContent });

    // A lesson card is shown the course card so the set looks like a set. The
    // course card itself has nothing to match and gets none — it is the thing
    // being matched.
    const reference = isCourseCard ? undefined : await loadCourseCardReference(course.id);

    // Generate image using GPT-5 Image Mini (1024x1024)
    const imageResult = await generateCardImage(
      imagePrompt,
      {
        courseId: course.id,
        stage: 'stage_7',
        phase: 'stage_7_card',
        lessonId: lesson.id,
      },
      reference ? [reference] : []
    );
    // `?? 0` only for the enrichment's own metadata field, which is a display
    // number and not the ledger. The ledger row is in `generation_trace`, where
    // an unestimated call is left genuinely unpriced and then settled against
    // the provider's charge.
    const imageCostUsd = imageResult.costUsd ?? 0;

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

    const durationMs = Date.now() - startTime;
    const visualStyleSource = describeVisualStyleSource(course);

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
        visual_style_source: visualStyleSource,
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
        visualStyleSource,
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
