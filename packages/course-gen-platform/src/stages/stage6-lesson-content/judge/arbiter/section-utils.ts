/**
 * Shared section utilities for Arbiter module
 * @module stages/stage6-lesson-content/judge/arbiter/section-utils
 *
 * Provides common functions for section ID parsing and location normalization
 * used across consolidate-verdicts, route-task, and conflict-resolver.
 *
 * Single source of truth to eliminate code duplication (Code Review Issue #1, #2).
 */

/**
 * Parse section index from sectionId
 *
 * Expected formats:
 * - "sec_0", "sec_1", "sec_2" - numeric sections
 * - "sec_introduction" - named introduction section
 * - "sec_conclusion" - named conclusion section
 *
 * @param sectionId - Section identifier (e.g., "sec_1", "sec_introduction")
 * @returns Numeric index for ordering (introduction=0, conclusion=9999)
 *
 * @example
 * parseSectionIndex('sec_1') // => 1
 * parseSectionIndex('sec_introduction') // => 0
 * parseSectionIndex('sec_conclusion') // => 9999
 */
export function parseSectionIndex(sectionId: string): number {
  const match = sectionId.match(/sec_(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Handle named sections - use consistent ordering
  const lower = sectionId.toLowerCase();

  // Introduction always first
  if (lower.includes('introduction') || lower.includes('intro')) {
    return 0;
  }

  // Conclusion always last
  if (lower.includes('conclusion') || lower.includes('summary')) {
    return 9999;
  }

  // Global/lesson-wide issues - process after all sections
  if (lower.includes('global')) {
    return 10000;
  }

  // Other named sections - fallback to hash-based ordering
  const namedSections = ['content', 'examples', 'exercises'];
  const idx = namedSections.findIndex((n) => lower.includes(n));
  if (idx >= 0) {
    return 100 + idx; // After numbered sections, before conclusion
  }

  // Unknown section - return large value to indicate unknown
  return 5000;
}

/**
 * Normalize location string for comparison
 *
 * Converts various location formats to a consistent normalized form
 * for grouping and comparison of issues across judges.
 *
 * @param location - Raw location string from judge issue
 * @returns Normalized location identifier
 *
 * @example
 * normalizeLocation('section 2') // => 'section_2'
 * normalizeLocation('Section 2, paragraph 3') // => 'section_2'
 * normalizeLocation('Introduction') // => 'introduction'
 */
export function normalizeLocation(location: string): string {
  const normalized = location.toLowerCase().trim();

  // Extract section number if present
  const sectionMatch = normalized.match(/section\s*(\d+)/);
  if (sectionMatch) {
    return `section_${sectionMatch[1]}`;
  }

  // Check for named sections
  if (normalized.includes('introduction') || normalized.includes('intro')) {
    return 'introduction';
  }
  if (normalized.includes('conclusion') || normalized.includes('summary')) {
    return 'conclusion';
  }

  // Handle global/lesson-wide locations
  // Includes common judge response patterns that refer to multiple/all sections
  if (
    normalized.includes('entire lesson') ||
    normalized.includes('whole lesson') ||
    normalized.includes('overall') ||
    normalized.includes('lesson-wide') ||
    normalized.includes('all sections') ||
    normalized.includes('content sections') ||
    normalized.includes('throughout') ||
    normalized.includes('multiple sections') ||
    normalized.includes('various') ||
    normalized === 'lesson' ||
    normalized === 'general' ||
    normalized === 'content'
  ) {
    return 'global';
  }

  // Extract first word as section identifier, with fallback to 'global'
  const wordMatch = normalized.match(/^(\w+)/);
  if (wordMatch) {
    // Check if first word is a common non-specific term
    const nonSpecificTerms = ['the', 'a', 'an', 'some', 'most', 'all', 'many'];
    if (nonSpecificTerms.includes(wordMatch[1])) {
      return 'global';
    }
    return wordMatch[1];
  }

  return 'global';
}

/**
 * Extract section ID from location string
 *
 * Converts free-form location text to a sec_X format ID.
 *
 * @param location - Raw location string from judge issue
 * @param sectionTitles - Optional array of actual section titles for matching
 * @returns Section ID in sec_X format
 *
 * @example
 * extractSectionIdFromLocation('section 2') // => 'sec_2'
 * extractSectionIdFromLocation('Introduction') // => 'sec_introduction'
 */
export function extractSectionIdFromLocation(
  location: string,
  sectionTitles?: string[]
): string {
  const normalized = location.toLowerCase().trim();

  // Try to extract section number
  const sectionMatch = normalized.match(/section\s*(\d+)/);
  if (sectionMatch) {
    return `sec_${sectionMatch[1]}`;
  }

  // Check for named sections
  if (normalized.includes('introduction') || normalized.includes('intro')) {
    return 'sec_introduction';
  }
  if (normalized.includes('conclusion') || normalized.includes('summary')) {
    return 'sec_conclusion';
  }

  // Handle global/lesson-wide locations - map to special "global" section
  // Includes common judge response patterns that refer to multiple/all sections
  if (
    normalized.includes('entire lesson') ||
    normalized.includes('whole lesson') ||
    normalized.includes('overall') ||
    normalized.includes('lesson-wide') ||
    normalized.includes('all sections') ||
    normalized.includes('content sections') ||
    normalized.includes('throughout') ||
    normalized.includes('multiple sections') ||
    normalized.includes('various') ||
    normalized === 'lesson' ||
    normalized === 'general' ||
    normalized === 'content'
  ) {
    return 'sec_global';
  }

  // Try to match against actual section titles
  if (sectionTitles) {
    for (let i = 0; i < sectionTitles.length; i++) {
      const titleNorm = sectionTitles[i].toLowerCase();
      if (normalized.includes(titleNorm) || titleNorm.includes(normalized)) {
        return `sec_${i + 1}`;
      }
    }
  }

  // Fallback: Unrecognized location formats are mapped to sec_global
  // This prevents failures when judges return non-standard location strings
  // These issues will be treated as lesson-wide and can still be refined
  return 'sec_global';
}
