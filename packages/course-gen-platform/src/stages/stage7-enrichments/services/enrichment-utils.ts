/**
 * Shared utilities for enrichment handlers
 * @module stages/stage7-enrichments/services/enrichment-utils
 *
 * Contains common functionality used by cover-handler and card-handler:
 * - Retry logic with exponential backoff
 * - Visual style extraction from course data
 * - Localized alt text generation
 */

import { logger } from '@/shared/logger';

// ============================================================================
// RETRY CONFIGURATION AND LOGIC
// ============================================================================

/**
 * Retry configuration for enrichment operations
 *
 * Used for upload retries with exponential backoff
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @param context - Optional context string for logging (e.g., 'Cover upload', 'Card upload')
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
  initialDelayMs: number = RETRY_CONFIG.INITIAL_DELAY_MS,
  context: string = 'Operation'
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
      logger.warn({ attempt, delayMs, error: lastError.message }, `${context} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ============================================================================
// VISUAL STYLE
// ============================================================================

/**
 * Visual style type definition
 */
export interface VisualStyle {
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
}

/**
 * Default visual style for cover images (Premium 3D Render + Cinematic lighting)
 *
 * Used when course lacks visual_style configuration.
 * Style is professional yet visually striking, suitable for B2B educational content.
 * Inspired by Apple, Notion, Linear aesthetics.
 */
export const DEFAULT_COVER_VISUAL_STYLE: VisualStyle = {
  colorScheme: 'rich gradients with deep shadows and luminous highlights, vibrant accent colors',
  aesthetic: 'premium 3D render, cinematic lighting, sophisticated and polished',
  visualElements:
    'glossy 3D objects, volumetric light rays, soft reflections, depth of field blur, floating elements',
  mood: 'inspiring, professional, cutting-edge, premium quality',
};

/**
 * Default visual style for card images (simpler, optimized for thumbnails)
 *
 * Used when course lacks visual_style configuration.
 * Style is clean and professional, optimized for small display sizes.
 */
export const DEFAULT_CARD_VISUAL_STYLE: VisualStyle = {
  colorScheme: 'blue and purple gradients with subtle accents',
  aesthetic: 'modern, professional, clean',
  visualElements: 'abstract geometric shapes, flowing lines',
  mood: 'professional, engaging, educational',
};

/**
 * Extract visual style from course data
 *
 * Retrieves the visual style from course.visual_style column,
 * falling back to course.settings.visual_style for legacy courses.
 * Uses provided default if no style is configured.
 *
 * @param course - Course data with visual_style and settings
 * @param defaultStyle - Default style to use if none is configured
 * @returns Visual style object with colorScheme, aesthetic, visualElements, mood
 */
export function getVisualStyle(
  course: { visual_style?: unknown; settings?: unknown },
  defaultStyle: VisualStyle = DEFAULT_COVER_VISUAL_STYLE
): VisualStyle {
  // First try dedicated visual_style column
  if (course.visual_style && typeof course.visual_style === 'object') {
    const vs = course.visual_style as Record<string, unknown>;
    if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
      return parseVisualStyleFields(vs) ?? defaultStyle;
    }
  }

  // Fallback to settings.visual_style (legacy)
  if (course.settings && typeof course.settings === 'object') {
    const settings = course.settings as Record<string, unknown>;
    if (settings.visual_style && typeof settings.visual_style === 'object') {
      const vs = settings.visual_style as Record<string, unknown>;
      if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
        return parseVisualStyleFields(vs) ?? defaultStyle;
      }
    }
  }

  return defaultStyle;
}

function parseVisualStyleFields(vs: Record<string, unknown>): VisualStyle | null {
  const colorScheme = vs.colorScheme;
  const aesthetic = vs.aesthetic;
  const visualElements = vs.visualElements;
  const mood = vs.mood;
  if (
    typeof colorScheme === 'string' &&
    typeof aesthetic === 'string' &&
    typeof visualElements === 'string' &&
    typeof mood === 'string'
  ) {
    return { colorScheme, aesthetic, visualElements, mood };
  }
  return null;
}

// ============================================================================
// ALT TEXT TEMPLATES
// ============================================================================

/**
 * Alt text templates for cover images - all 19 supported languages
 */
export const COVER_ALT_TEMPLATES: Record<string, string> = {
  en: 'Cover illustration for lesson:',
  ru: 'Обложка урока:',
  zh: '课程封面插图:',
  es: 'Ilustración de portada de la lección:',
  fr: 'Illustration de couverture de la leçon:',
  de: 'Titelbild der Lektion:',
  ja: 'レッスンのカバー画像:',
  ko: '수업 표지 일러스트:',
  ar: 'صورة غلاف الدرس:',
  pt: 'Ilustração de capa da lição:',
  it: 'Illustrazione di copertina della lezione:',
  tr: 'Ders kapak resmi:',
  vi: 'Hình minh họa bìa bài học:',
  th: 'ภาพปกบทเรียน:',
  id: 'Ilustrasi sampul pelajaran:',
  ms: 'Ilustrasi kulit pelajaran:',
  hi: 'पाठ के लिए कवर चित्रण:',
  bn: 'পাঠের কভার ইলাস্ট্রেশন:',
  pl: 'Ilustracja okładki lekcji:',
};

/**
 * Alt text templates for card images - all 19 supported languages
 * Includes both lesson and course variants
 */
export const CARD_ALT_TEMPLATES: Record<string, { lesson: string; course: string }> = {
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
 * Generate localized alt text for cover images
 *
 * @param language - Language code (e.g., 'ru', 'en')
 * @param lessonTitle - Title of the lesson
 * @returns Localized alt text string
 */
export function getCoverAltText(language: string, lessonTitle: string): string {
  const safeTitle = lessonTitle.slice(0, 100); // Limit length
  const template = COVER_ALT_TEMPLATES[language] ?? COVER_ALT_TEMPLATES.en;
  return `${template} ${safeTitle}`;
}

/**
 * Generate localized alt text for card images
 *
 * @param language - Language code (e.g., 'ru', 'en')
 * @param title - Course or lesson title
 * @param isLesson - Whether this is a lesson card or course card
 * @returns Localized alt text string
 */
export function getCardAltText(language: string, title: string, isLesson: boolean): string {
  const safeTitle = title.slice(0, 100);
  const templates = CARD_ALT_TEMPLATES[language] ?? CARD_ALT_TEMPLATES.en;
  const prefix = isLesson ? templates.lesson : templates.course;
  return `${prefix} ${safeTitle}`;
}
