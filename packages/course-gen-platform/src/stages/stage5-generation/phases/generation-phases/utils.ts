import type { Section } from '@megacampus/shared-types';

/** Calculate exponential backoff delay: baseMs * 2^(attempt-1) */
export function exponentialBackoff(attempt: number, baseMs: number): number {
  return baseMs * Math.pow(2, attempt - 1);
}

/**
 * RT-004 Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
} as const;

/**
 * Retry configuration for failed section re-generation.
 * Primary generation is SEQUENTIAL; retries use pLimit(2) for parallel recovery.
 * RETRY_ATTEMPTS_PER_SECTION is fetched from database via model-config-service.
 */
export const SECTION_RETRY_CONFIG = {
  /** Base retry delay in milliseconds (exponential backoff) */
  RETRY_DELAY_MS: 2000,
} as const;

/**
 * RT-001 Quality thresholds
 */
export const QUALITY_CONFIG = {
  MIN_SIMILARITY: 0.75, // Overall quality threshold
  MIN_LESSONS: 10, // FR-015: Minimum 10 lessons total
} as const;

/** Sanitize text for safe prompt injection: strip newlines, limit length @internal */
export const sanitizeDigest = (s: string, maxLen = 200): string =>
  s
    .replace(/[\n\r]+/g, ' ')
    .trim()
    .slice(0, maxLen);

/**
 * Build a text digest of a generated section for cross-section context.
 * Extracts lesson titles and key_topics from structured output.
 * Used to give subsequent sections awareness of previously generated content.
 *
 * Returns empty string if section has no lessons (skipped in accumulation).
 *
 * @param section - Generated section with lessons
 * @param sectionIndex - Section index (0-based)
 * @returns Formatted digest string, or empty string if no lesson content
 */
export function buildSectionDigest(section: Section, sectionIndex: number): string {
  const title = sanitizeDigest(section.section_title || `Section ${sectionIndex + 1}`);
  const lessons = (section.lessons || [])
    .map(l => {
      const lessonTitle = sanitizeDigest(l.lesson_title || 'Untitled Lesson');
      const topics = (l.key_topics || [])
        .slice(0, 3)
        .map(t => sanitizeDigest(t, 100))
        .join(', ');
      return `  - ${lessonTitle}${topics ? ` (Topics: ${topics})` : ''}`;
    })
    .join('\n');

  if (!lessons.trim()) {
    return '';
  }

  return `Section ${sectionIndex + 1} "${title}":\n${lessons}\n`;
}
