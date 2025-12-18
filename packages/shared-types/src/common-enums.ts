/**
 * Common Enum Schemas - Single Source of Truth
 * @module common-enums
 *
 * This module provides shared Zod enum schemas used across the platform.
 * All other packages should import from here (or via @megacampus/shared-types).
 */

import { z } from 'zod';

// ============================================================================
// Language Enum
// ============================================================================

/**
 * Language enum schema - all supported languages
 *
 * Languages supported:
 * - ru: Russian, en: English, zh: Chinese, es: Spanish
 * - fr: French, de: German, ja: Japanese, ko: Korean
 * - ar: Arabic, pt: Portuguese, it: Italian, tr: Turkish
 * - vi: Vietnamese, th: Thai, id: Indonesian, ms: Malay
 * - hi: Hindi, bn: Bengali, pl: Polish
 */
export const languageSchema = z.enum([
  'ru', 'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko',
  'ar', 'pt', 'it', 'tr', 'vi', 'th', 'id', 'ms',
  'hi', 'bn', 'pl'
]);

/** Inferred Language type from schema */
export type Language = z.infer<typeof languageSchema>;

/** Array of all supported languages */
export const SUPPORTED_LANGUAGES = languageSchema.options;

/**
 * Language code to full name mapping for LLM prompts
 * Full names help LLMs understand target language better than ISO codes
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: 'Russian',
  en: 'English',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  pt: 'Portuguese',
  it: 'Italian',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  hi: 'Hindi',
  bn: 'Bengali',
  pl: 'Polish',
};

/**
 * Get full language name from ISO code
 * Falls back to English for unknown codes
 *
 * @param code - ISO 639-1 language code (e.g., 'ru', 'en', 'zh')
 * @returns Full language name in English (e.g., 'Russian', 'English', 'Chinese')
 */
export function getLanguageName(code: string): string {
  const name = LANGUAGE_NAMES[code as Language];
  if (!name && process.env.NODE_ENV === 'development') {
    console.warn(`[getLanguageName] Unknown language code: "${code}", falling back to English`);
  }
  return name || LANGUAGE_NAMES.en;
}

// ============================================================================
// Difficulty/Level Enum
// ============================================================================

/**
 * Difficulty enum schema - includes expert level
 */
export const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

/** Inferred Difficulty type from schema */
export type Difficulty = z.infer<typeof difficultySchema>;

/** Array of all difficulty levels */
export const DIFFICULTY_LEVELS = difficultySchema.options;

// ============================================================================
// Course Level Enum
// ============================================================================

/**
 * Course level schema - subset of difficulty (excludes expert)
 * Used in courseSettingsSchema and similar contexts
 */
export const courseLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

/** Inferred CourseLevel type from schema */
export type CourseLevel = z.infer<typeof courseLevelSchema>;

/** Array of all course levels */
export const COURSE_LEVELS = courseLevelSchema.options;
