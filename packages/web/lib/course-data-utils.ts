/**
 * Shared utilities for course data transformation
 * Used by both regular course page and shared course page
 * @module lib/course-data-utils
 */

import type { Database } from '@/types/database.generated';
import type { Section, Lesson, Asset } from '@/types/database';

// Database row types
type SectionRow = Database['public']['Tables']['sections']['Row'];
type LessonRow = Database['public']['Tables']['lessons']['Row'];
type AssetRow = Database['public']['Tables']['assets']['Row'];
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row'];

/**
 * Groups assets by their lesson_id for efficient lookup
 * @param assets - Array of asset rows from database
 * @returns Record mapping lesson_id to array of assets
 */
export function groupAssetsByLessonId(
  assets: AssetRow[] | null
): Record<string, Asset[]> {
  if (!assets || assets.length === 0) return {};

  return assets.reduce((acc, asset) => {
    if (asset.lesson_id) {
      if (!acc[asset.lesson_id]) {
        acc[asset.lesson_id] = [];
      }
      acc[asset.lesson_id].push(asset as Asset);
    }
    return acc;
  }, {} as Record<string, Asset[]>);
}

/**
 * Groups enrichments by their lesson_id for efficient lookup
 * @param enrichments - Array of enrichment rows from database
 * @returns Record mapping lesson_id to array of enrichments
 */
export function groupEnrichmentsByLessonId(
  enrichments: EnrichmentRow[] | null
): Record<string, EnrichmentRow[]> {
  if (!enrichments || enrichments.length === 0) return {};

  return enrichments.reduce((acc, enrichment) => {
    const lessonId = enrichment.lesson_id;
    // Skip enrichments without lesson_id (like groupAssetsByLessonId does)
    if (!lessonId) return acc;

    if (!acc[lessonId]) {
      acc[lessonId] = [];
    }
    acc[lessonId].push(enrichment);
    return acc;
  }, {} as Record<string, EnrichmentRow[]>);
}

/**
 * Transforms database section rows into Section type with computed properties
 * @param sections - Array of section rows
 * @param lessons - Array of lesson rows to associate with sections
 * @param courseId - Course ID for lesson association
 * @returns Array of Section objects with nested lessons
 */
export function prepareSectionsForViewer(
  sections: SectionRow[] | null,
  lessons: LessonRow[] | null,
  courseId: string
): Section[] {
  if (!sections) return [];

  return sections.map((section) => ({
    ...section,
    section_number:
      section.order_index !== null && section.order_index !== undefined
        ? String(section.order_index)
        : '',
    order_number: section.order_index,
    lessons: (lessons || [])
      .filter((l) => l.section_id === section.id)
      .map((lesson) => ({
        ...lesson,
        lesson_number:
          lesson.order_index !== null && lesson.order_index !== undefined
            ? String(lesson.order_index)
            : '',
        course_id: courseId,
        order_number: lesson.order_index,
      })),
  })) as Section[];
}

/**
 * Transforms database lesson rows into Lesson type with computed properties
 * @param lessons - Array of lesson rows
 * @param courseId - Course ID for association
 * @returns Array of Lesson objects
 */
export function prepareLessonsForViewer(
  lessons: LessonRow[] | null,
  courseId: string
): Lesson[] {
  if (!lessons) return [];

  return lessons.map((lesson) => ({
    ...lesson,
    lesson_number:
      lesson.order_index !== null && lesson.order_index !== undefined
        ? String(lesson.order_index)
        : '',
    course_id: courseId,
    order_number: lesson.order_index,
  })) as Lesson[];
}

/** Share token validation constants */
export const SHARE_TOKEN_CONFIG = {
  PREFIX: 'share_',
  MIN_LENGTH: 10,
  MAX_LENGTH: 50,
  // Only allow alphanumeric, hyphen, and underscore after prefix
  VALID_PATTERN: /^share_[A-Za-z0-9_-]+$/,
} as const;

/**
 * Validates share token format with strict rules
 * - Must start with "share_" prefix
 * - Must be between 10 and 50 characters
 * - Must only contain alphanumeric characters, hyphens, and underscores
 *
 * @param token - Token string to validate
 * @returns True if token is valid, false otherwise
 */
export function isValidShareToken(token: string | undefined): token is string {
  if (!token) return false;

  return (
    token.startsWith(SHARE_TOKEN_CONFIG.PREFIX) &&
    token.length >= SHARE_TOKEN_CONFIG.MIN_LENGTH &&
    token.length <= SHARE_TOKEN_CONFIG.MAX_LENGTH &&
    SHARE_TOKEN_CONFIG.VALID_PATTERN.test(token)
  );
}

/**
 * Sanitizes token for safe logging (hides most of the token)
 * @param token - Token to sanitize
 * @returns Sanitized token showing only prefix
 */
export function sanitizeTokenForLog(token: string): string {
  if (!token || token.length < 10) return '***';
  return token.slice(0, 10) + '***';
}
