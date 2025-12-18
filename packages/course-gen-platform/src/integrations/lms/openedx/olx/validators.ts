/**
 * OLX Validation Functions
 * @module integrations/lms/openedx/olx/validators
 *
 * Validation rules for CourseInput and generated OLX structures.
 * Ensures data integrity before OLX generation and packaging.
 */

import type { CourseInput } from '@megacampus/shared-types/lms';
import type { OLXStructure } from './types';
import { lmsLogger } from '../../logger';

/**
 * Validation result structure
 *
 * Contains validation status and any errors found.
 * Used by all validation functions for consistent error reporting.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of error messages (empty if valid) */
  errors: string[];
}

/**
 * Content validation result structure
 *
 * Extended validation result that includes warnings for unsupported content.
 * Used by validateContentTypes to report both errors and non-blocking warnings.
 */
export interface ContentValidationResult extends ValidationResult {
  /** Array of warning messages (non-blocking) */
  warnings: string[];
}

/**
 * Validate CourseInput before OLX generation
 *
 * Checks that the course structure meets Open edX requirements:
 * - At least 1 chapter
 * - Each chapter has at least 1 section
 * - Each section has at least 1 unit
 * - courseId, org, run are ASCII alphanumeric
 * - All required fields present
 *
 * @param input - Course input structure to validate
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const result = validateCourseInput(courseInput);
 * if (!result.valid) {
 *   throw new OLXValidationError('Invalid course input', result.errors.map(msg => ({
 *     path: 'courseInput',
 *     message: msg,
 *     severity: 'error'
 *   })));
 * }
 * ```
 */
export function validateCourseInput(input: CourseInput): ValidationResult {
  const errors: string[] = [];

  // Check minimum chapters
  if (!input.chapters || input.chapters.length === 0) {
    errors.push('Course must have at least 1 chapter');
  }

  // Validate chapters structure
  input.chapters.forEach((chapter, chapterIdx) => {
    // Check minimum sections
    if (!chapter.sections || chapter.sections.length === 0) {
      errors.push(`Chapter ${chapterIdx} (${chapter.title}) must have at least 1 section`);
    }

    // Validate sections structure
    chapter.sections.forEach((section, sectionIdx) => {
      // Check minimum units
      if (!section.units || section.units.length === 0) {
        errors.push(
          `Chapter ${chapterIdx} Section ${sectionIdx} (${section.title}) must have at least 1 unit`
        );
      }

      // Validate units have content
      section.units.forEach((unit, unitIdx) => {
        if (!unit.content || unit.content.trim().length === 0) {
          errors.push(
            `Chapter ${chapterIdx} Section ${sectionIdx} Unit ${unitIdx} (${unit.title}) must have content`
          );
        }

        // Validate title is non-empty
        if (!unit.title || unit.title.trim().length === 0) {
          errors.push(
            `Chapter ${chapterIdx} Section ${sectionIdx} Unit ${unitIdx} must have a title`
          );
        }
      });
    });
  });

  // Validate ASCII identifiers (already validated by Zod schema, but double-check)
  const asciiPattern = /^[a-zA-Z0-9_-]+$/;

  if (!asciiPattern.test(input.courseId)) {
    errors.push(`courseId must be ASCII alphanumeric: ${input.courseId}`);
  }

  if (!asciiPattern.test(input.org)) {
    errors.push(`org must be ASCII alphanumeric: ${input.org}`);
  }

  if (!asciiPattern.test(input.run)) {
    errors.push(`run must be ASCII alphanumeric: ${input.run}`);
  }

  // Log validation result
  if (errors.length > 0) {
    lmsLogger.warn(
      { courseId: input.courseId, errorCount: errors.length },
      'CourseInput validation failed'
    );
  } else {
    lmsLogger.debug({ courseId: input.courseId }, 'CourseInput validation passed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate OLX structure after generation
 *
 * Ensures generated OLX structure is complete and valid:
 * - course.xml present and non-empty
 * - All url_names are ASCII-only
 * - No duplicate url_names within same element type
 * - At least 1 chapter
 * - Policy files present
 * - All maps non-empty
 *
 * @param structure - Generated OLX structure to validate
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const result = validateOLXStructure(olxStructure);
 * if (!result.valid) {
 *   throw new OLXValidationError('Invalid OLX structure', result.errors.map(msg => ({
 *     path: 'olxStructure',
 *     message: msg,
 *     severity: 'error'
 *   })));
 * }
 * ```
 */
export function validateOLXStructure(structure: OLXStructure): ValidationResult {
  const errors: string[] = [];

  // Validate course.xml exists
  if (!structure.courseXml || structure.courseXml.trim().length === 0) {
    errors.push('course.xml content is missing or empty');
  }

  // Validate courseKey format
  if (!structure.courseKey.startsWith('course-v1:')) {
    errors.push(`Invalid course key format: ${structure.courseKey}`);
  }

  // Validate minimum chapters
  if (structure.chapters.size === 0) {
    errors.push('Course must have at least 1 chapter (section)');
  }

  // Validate required hierarchical relationships
  if (structure.sequentials.size === 0) {
    errors.push('Course must have at least 1 sequential (subsection)');
  }

  if (structure.verticals.size === 0) {
    errors.push('Course must have at least 1 vertical (unit)');
  }

  // Validate url_names are ASCII-only
  const validateUrlNames = (map: Map<string, string>, elementType: string) => {
    for (const urlName of Array.from(map.keys())) {
      if (!isValidUrlName(urlName)) {
        errors.push(`Invalid ${elementType} url_name (must be ASCII): ${urlName}`);
      }
    }
  };

  validateUrlNames(structure.chapters, 'chapter');
  validateUrlNames(structure.sequentials, 'sequential');
  validateUrlNames(structure.verticals, 'vertical');
  validateUrlNames(structure.htmlRefs, 'html reference');
  validateUrlNames(structure.htmlContent, 'html content');

  // Validate no duplicate url_names within each type (Maps guarantee this, but check anyway)
  // This is already guaranteed by Map structure, but we document it

  // Validate policy files exist
  if (!structure.policies.policyJson || structure.policies.policyJson.trim().length === 0) {
    errors.push('policy.json is missing or empty');
  }

  if (
    !structure.policies.gradingPolicyJson ||
    structure.policies.gradingPolicyJson.trim().length === 0
  ) {
    errors.push('grading_policy.json is missing or empty');
  }

  // Validate policy files are valid JSON
  try {
    JSON.parse(structure.policies.policyJson);
  } catch (e) {
    errors.push(`policy.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    JSON.parse(structure.policies.gradingPolicyJson);
  } catch (e) {
    errors.push(
      `grading_policy.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Validate XML structure (basic check)
  const xmlFiles = [
    { name: 'course.xml', content: structure.courseXml },
    ...Array.from(structure.chapters.entries()).map(([name, content]) => ({
      name: `chapter/${name}.xml`,
      content,
    })),
    ...Array.from(structure.sequentials.entries()).map(([name, content]) => ({
      name: `sequential/${name}.xml`,
      content,
    })),
    ...Array.from(structure.verticals.entries()).map(([name, content]) => ({
      name: `vertical/${name}.xml`,
      content,
    })),
    ...Array.from(structure.htmlRefs.entries()).map(([name, content]) => ({
      name: `html/${name}.xml`,
      content,
    })),
  ];

  for (const file of xmlFiles) {
    const xmlResult = validateXml(file.content, file.name);
    if (!xmlResult.valid) {
      errors.push(...xmlResult.errors);
    }
  }

  // Log validation result
  if (errors.length > 0) {
    lmsLogger.warn(
      { courseKey: structure.courseKey, errorCount: errors.length },
      'OLX structure validation failed'
    );
  } else {
    lmsLogger.debug({ courseKey: structure.courseKey }, 'OLX structure validation passed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate single XML file content
 *
 * Performs basic XML well-formedness checks:
 * - Contains XML tags (< and >)
 * - Valid UTF-8 encoding
 * - No obvious syntax errors
 *
 * Note: This is a basic check. Full XML parsing is not performed
 * to avoid dependencies on XML parsers.
 *
 * @param content - XML content to validate
 * @param filename - Filename for error messages
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const result = validateXml('<course>...</course>', 'course.xml');
 * if (!result.valid) {
 *   console.error('Invalid XML:', result.errors);
 * }
 * ```
 */
export function validateXml(content: string, filename: string): ValidationResult {
  const errors: string[] = [];

  // Check content exists
  if (!content || content.trim().length === 0) {
    errors.push(`${filename}: XML content is empty`);
    return { valid: false, errors };
  }

  // Check for XML tags
  if (!content.includes('<') || !content.includes('>')) {
    errors.push(`${filename}: Content does not appear to be XML (no tags found)`);
  }

  // Check for basic well-formedness (opening and closing tags)
  // Match opening tags like <tag> or <tag attr="val"> but NOT </tag> or self-closing
  const openingTags = content.match(/<(?!\/)(\w+)(?:\s|>)/g) || [];
  const closingTags = content.match(/<\/(\w+)>/g) || [];
  const selfClosingTags = content.match(/<\w+[^>]*\/>/g) || [];

  // Basic tag balance check (not perfect, but catches obvious errors)
  // Opening count: opening tags minus self-closing (which are counted in both)
  const totalOpening = openingTags.length - selfClosingTags.length;
  const totalClosing = closingTags.length;

  if (totalOpening !== totalClosing) {
    errors.push(
      `${filename}: Mismatched XML tags (${totalOpening} opening, ${totalClosing} closing)`
    );
  }

  // Check for valid UTF-8 (basic check)
  try {
    // Try to encode/decode to verify UTF-8 validity
    new TextEncoder().encode(content);
  } catch (e) {
    errors.push(
      `${filename}: Invalid UTF-8 encoding: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if url_name is valid ASCII identifier
 *
 * Valid url_names must:
 * - Contain only ASCII lowercase letters, digits, underscores, hyphens
 * - Be between 1 and 100 characters
 * - Match pattern: /^[a-z0-9_-]+$/
 *
 * @param urlName - URL name to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidUrlName('chapter_1')         // true
 * isValidUrlName('lesson-intro')      // true
 * isValidUrlName('unit_123')          // true
 * isValidUrlName('Введение')          // false (Cyrillic)
 * isValidUrlName('hello world')       // false (space)
 * isValidUrlName('')                  // false (empty)
 * ```
 */
export function isValidUrlName(urlName: string): boolean {
  // Check length
  if (urlName.length === 0 || urlName.length > 100) {
    return false;
  }

  // Check pattern: lowercase letters, digits, underscore, hyphen only
  const pattern = /^[a-z0-9_-]+$/;
  return pattern.test(urlName);
}

/**
 * Validate content types for Open edX compatibility
 *
 * Checks unit content for unsupported elements and generates warnings:
 * - Video elements: Will be rendered as placeholder text in Open edX
 * - Quiz/assessment patterns: Not supported in MVP
 * - External embeds (iframe): May not work in LMS context
 *
 * This validator does not block content generation (warnings only).
 * Content containing only HTML/text passes without warnings.
 *
 * @param input - Course input structure to validate
 * @returns Content validation result with warnings for unsupported elements
 *
 * @example
 * ```typescript
 * const result = validateContentTypes(courseInput);
 * if (result.warnings.length > 0) {
 *   console.warn('Content contains unsupported elements:', result.warnings);
 * }
 * ```
 */
export function validateContentTypes(input: CourseInput): ContentValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Patterns for detecting unsupported content types
  const videoPatterns = [
    /<\s*video[^>]*>/i, // HTML5 video tag (with optional whitespace)
    /\[video\]/i, // Markdown-style video placeholder
    /<\s*source[^>]*type=["']video/i, // Video source element
  ];

  const quizPatterns = [
    /<\s*(?:quiz|question|assessment)[^>]*>/i, // Quiz/question/assessment tags
    /\[quiz\]/i, // Quiz placeholder
    /\[question\]/i, // Question placeholder
    /\[assessment\]/i, // Assessment placeholder
    /(?:quiz|question|assessment):\s*{/i, // JSON-like quiz structure
  ];

  const iframePattern = /<\s*iframe[^>]*>/i; // External embeds (with optional whitespace)

  // Track which warnings we've already issued to avoid duplicates
  const issuedWarnings = new Set<string>();

  // Iterate through all units to check content
  input.chapters.forEach((chapter, chapterIdx) => {
    chapter.sections.forEach((section, sectionIdx) => {
      section.units.forEach((unit, unitIdx) => {
        const content = unit.content;
        const location = `Chapter ${chapterIdx + 1}, Section ${sectionIdx + 1}, Unit ${unitIdx + 1} ("${unit.title}")`;

        // Check for video content
        if (videoPatterns.some((pattern) => pattern.test(content))) {
          if (!issuedWarnings.has('video')) {
            warnings.push(
              'Video content detected: Open edX will render video elements as placeholder text. ' +
                'Video streaming is not fully supported in the current MVP. ' +
                `First occurrence: ${location}`
            );
            issuedWarnings.add('video');
          }
        }

        // Check for quiz/assessment content
        if (quizPatterns.some((pattern) => pattern.test(content))) {
          if (!issuedWarnings.has('quiz')) {
            warnings.push(
              'Quiz/assessment content detected: Interactive quizzes and assessments are not supported in the current MVP. ' +
                'This content will be displayed as static HTML only. ' +
                `First occurrence: ${location}`
            );
            issuedWarnings.add('quiz');
          }
        }

        // Check for iframe embeds
        if (iframePattern.test(content)) {
          if (!issuedWarnings.has('iframe')) {
            warnings.push(
              'External embed (iframe) detected: External embeds may not work correctly in the Open edX LMS context. ' +
                'Content Security Policy restrictions may prevent iframe rendering. ' +
                `First occurrence: ${location}`
            );
            issuedWarnings.add('iframe');
          }
        }
      });
    });
  });

  // Log warnings if any were found
  if (warnings.length > 0) {
    lmsLogger.warn(
      {
        courseId: input.courseId,
        warningCount: warnings.length,
        unsupportedTypes: Array.from(issuedWarnings),
      },
      'Content validation warnings detected'
    );
  } else {
    lmsLogger.debug({ courseId: input.courseId }, 'Content validation passed (no warnings)');
  }

  return {
    valid: errors.length === 0, // Always valid for warnings-only validation
    errors,
    warnings,
  };
}
