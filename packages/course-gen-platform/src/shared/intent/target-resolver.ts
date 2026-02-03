/**
 * Target Resolution Service for Chat Intent Processing
 *
 * Resolves user's natural language identifiers to actual paths in course structure.
 * Supports patterns like:
 * - "урок 2.3" → "sections[1].lessons[2]"
 * - "секция Введение" → "sections[0]"
 * - "section 2" → "sections[1]"
 *
 * @module intent/target-resolver
 */

import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Resolve user's identifier (e.g., "урок 2.3", "секция Введение") to actual path
 *
 * @param identifier - User's natural language identifier
 * @param explicitPath - Explicit path from LLM classification
 * @param courseStructure - Course structure to resolve against
 * @param nodeContextPath - Path from node context (user selected element)
 * @returns Resolved path or null if cannot resolve
 *
 * @example
 * ```typescript
 * const path = resolveTargetPath("урок 2.3", undefined, courseStructure);
 * // "sections[1].lessons[2]"
 * ```
 */
export function resolveTargetPath(
  identifier: string | undefined,
  explicitPath: string | undefined,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): string | null {
  // 1. If explicit path provided, use it
  if (explicitPath) {
    return explicitPath;
  }

  // 2. If nodeContext path provided (user selected element), use it
  if (nodeContextPath) {
    return nodeContextPath;
  }

  // 3. Try to resolve from identifier
  if (!identifier) {
    return null;
  }

  // Match patterns like "урок 2.3", "lesson 2.3", "урок 1.2"
  const lessonMatch = identifier.match(/(?:урок|lesson)\s*(\d+)\.(\d+)/i);
  if (lessonMatch) {
    const [, sectionNum, lessonNum] = lessonMatch;
    const sectionIndex = parseInt(sectionNum, 10) - 1;
    const lessonIndex = parseInt(lessonNum, 10) - 1;

    if (
      courseStructure.sections[sectionIndex] &&
      courseStructure.sections[sectionIndex].lessons[lessonIndex]
    ) {
      return `sections[${sectionIndex}].lessons[${lessonIndex}]`;
    }
  }

  // Match patterns like "секция 2", "section 2", "секция Введение", "раздел 3"
  const sectionNumMatch = identifier.match(/(?:секция|section|раздел)\s*(\d+)/i);
  if (sectionNumMatch) {
    const sectionIndex = parseInt(sectionNumMatch[1], 10) - 1;
    if (courseStructure.sections[sectionIndex]) {
      return `sections[${sectionIndex}]`;
    }
  }

  // Match by section title
  const sectionTitleMatch = identifier.match(/(?:секция|section|раздел)\s+["']?(.+?)["']?$/i);
  if (sectionTitleMatch) {
    const title = sectionTitleMatch[1].toLowerCase();
    const index = courseStructure.sections.findIndex(s =>
      s.section_title.toLowerCase().includes(title)
    );
    if (index !== -1) {
      return `sections[${index}]`;
    }
  }

  // Try to find by lesson title substring (fuzzy match)
  const lowerIdentifier = identifier.toLowerCase();
  for (let sIdx = 0; sIdx < courseStructure.sections.length; sIdx++) {
    const section = courseStructure.sections[sIdx];
    for (let lIdx = 0; lIdx < section.lessons.length; lIdx++) {
      const lesson = section.lessons[lIdx];
      if (lesson.lesson_title.toLowerCase().includes(lowerIdentifier)) {
        return `sections[${sIdx}].lessons[${lIdx}]`;
      }
    }
  }

  // Try to find by section title substring (fuzzy match)
  for (let sIdx = 0; sIdx < courseStructure.sections.length; sIdx++) {
    const section = courseStructure.sections[sIdx];
    if (section.section_title.toLowerCase().includes(lowerIdentifier)) {
      return `sections[${sIdx}]`;
    }
  }

  return null;
}

// ============================================================================
// Element Access
// ============================================================================

/**
 * Get element at path from course structure
 *
 * @param courseStructure - Course structure to query
 * @param path - Path to element (e.g., "sections[0].lessons[2]")
 * @returns Section or Lesson at path, or null if not found
 */
export function getElementAtPath(
  courseStructure: CourseStructure,
  path: string
): Section | Lesson | null {
  try {
    const parts = path.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
    if (!parts) return null;

    const sectionIndex = parseInt(parts[1], 10);
    const section = courseStructure.sections[sectionIndex];
    if (!section) return null;

    if (parts[2] !== undefined) {
      const lessonIndex = parseInt(parts[2], 10);
      return section.lessons[lessonIndex] || null;
    }

    return section;
  } catch {
    return null;
  }
}

/**
 * Check if path points to a lesson (vs section)
 */
export function isLessonPath(path: string): boolean {
  return path.includes('.lessons[');
}

/**
 * Check if path points to a section
 */
export function isSectionPath(path: string): boolean {
  return path.startsWith('sections[') && !path.includes('.lessons[');
}

/**
 * Parse path to extract indices
 */
export function parsePathIndices(
  path: string
): { sectionIndex: number; lessonIndex?: number } | null {
  const match = path.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
  if (!match) return null;

  return {
    sectionIndex: parseInt(match[1], 10),
    lessonIndex: match[2] !== undefined ? parseInt(match[2], 10) : undefined,
  };
}

// ============================================================================
// Outline Generation (for targeted context)
// ============================================================================

/**
 * Generate lightweight course outline for context (when no specific element selected)
 * This is much smaller than full course_structure (~500 tokens vs 42K)
 */
export function generateCourseOutline(courseStructure: CourseStructure): {
  course_title: string;
  course_description: string;
  total_duration_hours: number;
  sections: Array<{
    section_number: number;
    section_title: string;
    lessons: Array<{
      lesson_number: string;
      lesson_title: string;
    }>;
  }>;
} {
  return {
    course_title: courseStructure.course_title,
    course_description: courseStructure.course_description,
    total_duration_hours: courseStructure.estimated_duration_hours,
    sections: courseStructure.sections.map((s, index) => ({
      section_number: s.section_number ?? index + 1,
      section_title: s.section_title,
      lessons: s.lessons.map(l => ({
        lesson_number: String(l.lesson_number),
        lesson_title: l.lesson_title,
      })),
    })),
  };
}
