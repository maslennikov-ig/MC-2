/**
 * Minimum Lessons Validator (FR-015)
 *
 * Ensures generated course has at least 10 lessons total.
 * This validator checks course completeness before proceeding to Stage 6.
 *
 * @module stages/stage5-generation/validators/minimum-lessons-validator
 * @see specs/008-generation-generation-json/data-model.md (FR-015)
 */

import type { Section } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types';
import logger from '@/shared/logger';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Section breakdown for validation result
 */
export interface SectionBreakdown {
  sectionId: string;
  sectionTitle: string;
  lessonCount: number;
}

/**
 * Validation result for minimum lessons check
 */
export interface MinimumLessonsValidationResult {
  /** Whether validation passed (totalLessons >= minimumRequired) */
  passed: boolean;
  /** Total number of lessons found */
  totalLessons: number;
  /** Minimum required lessons (default: 10 per FR-015) */
  minimumRequired: number;
  /** Deficit: 0 if passed, positive number if failed */
  deficit: number;
  /** Breakdown of lessons per section */
  sectionBreakdown: SectionBreakdown[];
  /** Recommendations if validation failed */
  recommendations?: string[];
}

/**
 * Configuration for the MinimumLessonsValidator
 */
export interface MinimumLessonsValidatorConfig {
  /** Minimum number of lessons required (default: 10 per FR-015) */
  minimumLessons?: number;
  /** If true, throw error on failure; if false, return result (default: false) */
  strictMode?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** FR-015: Minimum lessons requirement */
const DEFAULT_MINIMUM_LESSONS = 10;

/** Threshold for low lesson count per section */
const LOW_LESSON_SECTION_THRESHOLD = 3;

// ============================================================================
// VALIDATOR CLASS
// ============================================================================

/**
 * MinimumLessonsValidator validates that a course has at least the required
 * minimum number of lessons (FR-015: 10 lessons by default).
 *
 * Supports both Section[] (existing format) and LessonSpecificationV2[] (V2 format).
 *
 * @example
 * ```typescript
 * const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
 *
 * // Validate Section[] output
 * const result = validator.validateSections(sections);
 * if (!result.passed) {
 *   logger.warn({ ...result }, 'Course does not meet minimum lesson requirement');
 * }
 *
 * // Validate V2 specs
 * const v2Result = validator.validateV2Specs(lessonSpecs);
 * ```
 */
export class MinimumLessonsValidator {
  private config: Required<MinimumLessonsValidatorConfig>;

  constructor(config?: MinimumLessonsValidatorConfig) {
    this.config = {
      minimumLessons: config?.minimumLessons ?? DEFAULT_MINIMUM_LESSONS,
      strictMode: config?.strictMode ?? false,
    };
  }

  /**
   * Validate array of Section[] (existing output format)
   *
   * Counts lessons across all sections and validates against minimum requirement.
   *
   * @param sections - Array of Section objects from generation output
   * @returns Validation result with breakdown and recommendations
   * @throws Error if strictMode is true and validation fails
   */
  validateSections(sections: Section[]): MinimumLessonsValidationResult {
    logger.info(
      { sectionCount: sections.length, minimumRequired: this.config.minimumLessons },
      'Starting minimum lessons validation for Section[]'
    );

    // Build section breakdown
    const sectionBreakdown: SectionBreakdown[] = sections.map((section, index) => ({
      sectionId: `section-${section.section_number ?? index + 1}`,
      sectionTitle: section.section_title,
      lessonCount: section.lessons?.length ?? 0,
    }));

    // Calculate total lessons
    const totalLessons = sectionBreakdown.reduce(
      (sum, section) => sum + section.lessonCount,
      0
    );

    // Determine pass/fail
    const passed = totalLessons >= this.config.minimumLessons;
    const deficit = passed ? 0 : this.config.minimumLessons - totalLessons;

    // Build result
    const result: MinimumLessonsValidationResult = {
      passed,
      totalLessons,
      minimumRequired: this.config.minimumLessons,
      deficit,
      sectionBreakdown,
    };

    // Add recommendations if failed
    if (!passed) {
      result.recommendations = this.getRecommendations(result);
    }

    // Log result
    if (passed) {
      logger.info(
        { totalLessons, minimumRequired: this.config.minimumLessons },
        'Minimum lessons validation PASSED'
      );
    } else {
      logger.warn(
        {
          totalLessons,
          minimumRequired: this.config.minimumLessons,
          deficit,
          recommendations: result.recommendations,
        },
        'Minimum lessons validation FAILED'
      );
    }

    // Log section breakdown at debug level
    logger.debug({ sectionBreakdown }, 'Section breakdown for minimum lessons validation');

    // Handle strict mode
    if (this.config.strictMode && !passed) {
      throw new Error(
        `FR-015 validation failed: Course has ${totalLessons} lessons, ` +
          `minimum required is ${this.config.minimumLessons} (deficit: ${deficit})`
      );
    }

    return result;
  }

  /**
   * Validate array of LessonSpecificationV2[] (V2 output format)
   *
   * Each LessonSpecificationV2 represents one lesson, so count is direct.
   *
   * @param specs - Array of LessonSpecificationV2 objects
   * @returns Validation result with breakdown and recommendations
   * @throws Error if strictMode is true and validation fails
   */
  validateV2Specs(specs: LessonSpecificationV2[]): MinimumLessonsValidationResult {
    logger.info(
      { specCount: specs.length, minimumRequired: this.config.minimumLessons },
      'Starting minimum lessons validation for LessonSpecificationV2[]'
    );

    // Group specs by section (extract section number from lesson_id format "section.lesson")
    const sectionMap = new Map<string, { title: string; count: number }>();

    for (const spec of specs) {
      // lesson_id format: "section.lesson" (e.g., "1.1", "2.3")
      const sectionNumber = spec.lesson_id.split('.')[0];
      const sectionKey = `section-${sectionNumber}`;

      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          title: `Section ${sectionNumber}`,
          count: 0,
        });
      }

      const sectionData = sectionMap.get(sectionKey)!;
      sectionData.count++;
    }

    // Build section breakdown
    const sectionBreakdown: SectionBreakdown[] = Array.from(sectionMap.entries()).map(
      ([sectionId, data]) => ({
        sectionId,
        sectionTitle: data.title,
        lessonCount: data.count,
      })
    );

    // Total lessons = array length (each spec is one lesson)
    const totalLessons = specs.length;

    // Determine pass/fail
    const passed = totalLessons >= this.config.minimumLessons;
    const deficit = passed ? 0 : this.config.minimumLessons - totalLessons;

    // Build result
    const result: MinimumLessonsValidationResult = {
      passed,
      totalLessons,
      minimumRequired: this.config.minimumLessons,
      deficit,
      sectionBreakdown,
    };

    // Add recommendations if failed
    if (!passed) {
      result.recommendations = this.getRecommendations(result);
    }

    // Log result
    if (passed) {
      logger.info(
        { totalLessons, minimumRequired: this.config.minimumLessons },
        'Minimum lessons validation (V2) PASSED'
      );
    } else {
      logger.warn(
        {
          totalLessons,
          minimumRequired: this.config.minimumLessons,
          deficit,
          recommendations: result.recommendations,
        },
        'Minimum lessons validation (V2) FAILED'
      );
    }

    // Log section breakdown at debug level
    logger.debug({ sectionBreakdown }, 'Section breakdown for V2 minimum lessons validation');

    // Handle strict mode
    if (this.config.strictMode && !passed) {
      throw new Error(
        `FR-015 validation failed: Course has ${totalLessons} lessons (V2), ` +
          `minimum required is ${this.config.minimumLessons} (deficit: ${deficit})`
      );
    }

    return result;
  }

  /**
   * Get recommendations for meeting minimum lesson requirement
   *
   * @param result - Validation result to generate recommendations for
   * @returns Array of recommendation strings
   */
  getRecommendations(result: MinimumLessonsValidationResult): string[] {
    const recommendations: string[] = [];

    // Main recommendation: add more lessons
    if (result.deficit > 0) {
      recommendations.push(
        `Add ${result.deficit} more lesson${result.deficit > 1 ? 's' : ''} to meet the minimum requirement of ${result.minimumRequired} lessons`
      );
    }

    // Find sections with low lesson counts
    const lowLessonSections = result.sectionBreakdown.filter(
      (section) => section.lessonCount < LOW_LESSON_SECTION_THRESHOLD
    );

    if (lowLessonSections.length > 0) {
      recommendations.push(
        `Consider expanding sections with fewer than ${LOW_LESSON_SECTION_THRESHOLD} lessons:`
      );

      for (const section of lowLessonSections) {
        recommendations.push(
          `  - "${section.sectionTitle}" has only ${section.lessonCount} lesson${section.lessonCount !== 1 ? 's' : ''}`
        );
      }
    }

    // Check for empty sections
    const emptySections = result.sectionBreakdown.filter(
      (section) => section.lessonCount === 0
    );

    if (emptySections.length > 0) {
      recommendations.push(
        `Warning: ${emptySections.length} section${emptySections.length > 1 ? 's have' : ' has'} no lessons - consider removing or adding content`
      );
    }

    return recommendations;
  }
}
