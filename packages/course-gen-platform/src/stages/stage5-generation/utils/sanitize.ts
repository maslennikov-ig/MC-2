/**
 * XSS Sanitization for CourseStructure
 *
 * Recursively sanitizes all string fields in CourseStructure to prevent XSS attacks.
 * Uses DOMPurify to strip dangerous HTML/JavaScript while preserving safe text content.
 *
 * **Security Context** (FR-008):
 * LLM-generated course structures may contain malicious HTML/JavaScript injected
 * through prompt injection attacks. This utility ensures all string fields are
 * sanitized before storage/display to prevent XSS vulnerabilities.
 *
 * **Sanitization Strategy**:
 * - Strip ALL HTML tags (ALLOWED_TAGS: [])
 * - Strip ALL attributes (ALLOWED_ATTR: [])
 * - Keep only plain text content (KEEP_CONTENT: true)
 * - Recursive transformation (immutable - returns new object)
 *
 * **XSS Prevention Examples**:
 * - `<script>alert('XSS')</script>` → `` (removed)
 * - `<img src=x onerror=alert(1)>` → `` (removed)
 * - `<p onclick="evil()">text</p>` → `text` (tag removed, text kept)
 * - `<a href="javascript:alert()">link</a>` → `link` (tag removed, text kept)
 *
 * @module services/stage5/sanitize-course-structure
 * @see specs/008-generation-generation-json/spec.md (FR-008 XSS Prevention)
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import stripAnsi from 'strip-ansi';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';
import logger from '@/shared/logger';

/**
 * Create DOMPurify instance for Node.js environment
 *
 * DOMPurify requires a window object, which doesn't exist in Node.js.
 * We use jsdom to create a minimal DOM environment.
 */
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Sanitize a single value (primitive, array, or object)
 *
 * Recursively processes values to sanitize all strings while preserving structure.
 *
 * @param value - Value to sanitize (any type)
 * @returns Sanitized value (same type as input)
 *
 * @example
 * ```typescript
 * // String sanitization
 * sanitizeValue("<script>alert(1)</script>text")
 * // Returns: "text"
 *
 * // Array sanitization
 * sanitizeValue(["<b>bold</b>", "plain", "<script>evil</script>"])
 * // Returns: ["bold", "plain", ""]
 *
 * // Object sanitization
 * sanitizeValue({ title: "<p onclick='x()'>Title</p>", count: 5 })
 * // Returns: { title: "Title", count: 5 }
 * ```
 */
function sanitizeValue(value: any): any {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings - SANITIZE with DOMPurify
  if (typeof value === 'string') {
    // Sanitize with DOMPurify to remove ALL HTML tags and attributes
    // DOMPurify will strip <script> tags but may keep their text content
    // With KEEP_CONTENT: true, it preserves safe text while removing dangerous HTML
    const purified = purify.sanitize(value, {
      ALLOWED_TAGS: [],       // Strip ALL HTML tags
      ALLOWED_ATTR: [],       // Strip ALL attributes
      KEEP_CONTENT: true,     // Keep text content even if tags are removed
      RETURN_DOM: false,      // Return string (not DOM object)
      RETURN_DOM_FRAGMENT: false,
    });

    // Strip ANSI escape sequences if any were introduced
    return stripAnsi(purified);
  }

  // Handle arrays - recursively sanitize elements
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  // Handle objects - recursively sanitize all properties
  if (typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  // Primitives (number, boolean, etc.) - return as-is
  return value;
}

/**
 * Recursively sanitize entire CourseStructure for XSS prevention
 *
 * Processes all string fields in the course structure to remove potential XSS vectors.
 * This includes course metadata, sections, lessons, learning objectives, exercises, etc.
 *
 * **Fields Sanitized** (all string fields in CourseStructure):
 * - Course: course_title, course_description, course_overview, target_audience
 * - Section: section_title, section_description
 * - Lesson: lesson_title
 * - Learning Objectives: text (in lesson_objectives, learning_outcomes arrays)
 * - Topics: key_topics array elements
 * - Exercises: exercise_title, exercise_description
 * - Assessment: assessment_description
 * - Tags: prerequisites, course_tags array elements
 *
 * **Immutability**:
 * Returns a new sanitized CourseStructure object. Does NOT mutate input.
 *
 * @param courseStructure - Raw course structure from LLM (may contain XSS vectors)
 * @returns New sanitized course structure (safe for storage/display)
 *
 * @example
 * ```typescript
 * const raw: CourseStructure = {
 *   course_title: "<script>alert('XSS')</script>ML Course",
 *   course_description: "<p onclick='evil()'>Learn ML</p>",
 *   sections: [
 *     {
 *       section_title: "<img src=x onerror=alert(1)>Intro",
 *       lessons: [
 *         {
 *           lesson_title: "<a href='javascript:alert()'>Basics</a>",
 *           lesson_objectives: [
 *             { text: "<b>Understand</b> ML <script>evil</script>" }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * };
 *
 * const clean = sanitizeCourseStructure(raw);
 * // Returns: {
 * //   course_title: "ML Course",
 * //   course_description: "Learn ML",
 * //   sections: [
 * //     {
 * //       section_title: "Intro",
 * //       lessons: [
 * //         {
 * //           lesson_title: "Basics",
 * //           lesson_objectives: [
 * //             { text: "Understand ML " }
 * //           ]
 * //         }
 * //       ]
 * //     }
 * //   ]
 * // }
 * ```
 */
export function sanitizeCourseStructure(
  courseStructure: CourseStructure
): CourseStructure {
  logger.info('Sanitizing CourseStructure for XSS prevention (FR-008)');

  // Recursively sanitize entire structure
  const sanitized = sanitizeValue(courseStructure) as CourseStructure;

  logger.info('CourseStructure sanitization complete');

  return sanitized;
}

/**
 * Sanitize CourseStructure with detailed logging
 *
 * Same as sanitizeCourseStructure but logs detailed information about
 * XSS vectors detected and removed. Useful for security auditing.
 *
 * @param courseStructure - Raw course structure from LLM
 * @returns New sanitized course structure
 *
 * @example
 * ```typescript
 * const raw = { course_title: "<script>alert(1)</script>Safe Title" };
 * const clean = sanitizeCourseStructureWithLogging(raw);
 * // Logs: "XSS vector detected in course structure"
 * // Returns: { course_title: "Safe Title" }
 * ```
 */
export function sanitizeCourseStructureWithLogging(
  courseStructure: CourseStructure
): CourseStructure {
  logger.info('Sanitizing CourseStructure with detailed logging (FR-008)');

  // Serialize original structure for comparison
  const originalJSON = JSON.stringify(courseStructure);
  const originalLength = originalJSON.length;

  // Sanitize structure
  const sanitized = sanitizeValue(courseStructure) as CourseStructure;

  // Check if sanitization removed content
  const sanitizedJSON = JSON.stringify(sanitized);
  const sanitizedLength = sanitizedJSON.length;

  if (originalLength > sanitizedLength) {
    const removedBytes = originalLength - sanitizedLength;
    const removalPercentage = ((removedBytes / originalLength) * 100).toFixed(2);

    logger.warn(
      {
        originalLength,
        sanitizedLength,
        removedBytes,
        removalPercentage,
      },
      'XSS vector detected and removed from course structure'
    );
  } else {
    logger.info('No XSS vectors detected in course structure');
  }

  return sanitized;
}
