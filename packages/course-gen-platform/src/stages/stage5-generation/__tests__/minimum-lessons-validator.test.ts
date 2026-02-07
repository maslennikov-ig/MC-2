/* eslint-disable */
/**
 * Unit tests for MinimumLessonsValidator class
 *
 * Tests cover:
 * - Dynamic min_lessons from course_size presets
 * - Max lessons with 20% tolerance (non-blocking warning)
 * - Section breakdown calculation
 * - V2 specs validation
 *
 * @module tests/unit/stages/stage5/minimum-lessons-validator.test
 * @see stages/stage5-generation/validators/minimum-lessons-validator.ts
 */

import { describe, it, expect } from 'vitest';
import {
  MinimumLessonsValidator,
  type MinimumLessonsValidationResult,
} from '@/stages/stage5-generation/validators/minimum-lessons-validator';
import type { Section } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock Section[] for testing
 */
function createMockSections(lessonCounts: number[]): Section[] {
  return lessonCounts.map((count, index) => ({
    section_number: index + 1,
    section_title: `Section ${index + 1}`,
    section_description: `Description for section ${index + 1}`,
    learning_objectives: ['Objective 1'],
    estimated_duration_minutes: count * 15,
    lessons: Array.from({ length: count }, (_, i) => ({
      lesson_number: i + 1,
      lesson_title: `Lesson ${i + 1}`,
      lesson_objectives: ['Objective 1'],
      key_topics: ['Topic 1'],
      estimated_duration_minutes: 15,
    })),
  })) as Section[];
}

/**
 * Create mock LessonSpecificationV2[] for testing
 */
function createMockV2Specs(sectionLessonCounts: number[]): LessonSpecificationV2[] {
  const specs: LessonSpecificationV2[] = [];

  sectionLessonCounts.forEach((lessonCount, sectionIndex) => {
    for (let lessonNum = 1; lessonNum <= lessonCount; lessonNum++) {
      specs.push({
        lesson_id: `${sectionIndex + 1}.${lessonNum}`,
        lesson_title: `Lesson ${sectionIndex + 1}.${lessonNum}`,
        learning_objectives: ['Objective 1'],
        key_points: ['Key point 1'],
        activity_types: ['reading'],
        target_token_budget: 1000,
      } as LessonSpecificationV2);
    }
  });

  return specs;
}

// ============================================================================
// BASIC VALIDATION TESTS
// ============================================================================

describe('MinimumLessonsValidator', () => {
  describe('validateSections - Basic Validation', () => {
    it('should pass when total lessons >= default minimum (10)', () => {
      const validator = new MinimumLessonsValidator();
      const sections = createMockSections([3, 3, 4]); // 10 lessons total

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.totalLessons).toBe(10);
      expect(result.minimumRequired).toBe(10);
      expect(result.deficit).toBe(0);
    });

    it('should fail when total lessons < default minimum (10)', () => {
      const validator = new MinimumLessonsValidator();
      const sections = createMockSections([2, 2, 2]); // 6 lessons total

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(false);
      expect(result.totalLessons).toBe(6);
      expect(result.deficit).toBe(4);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations?.length).toBeGreaterThan(0);
    });

    it('should use custom minimum lessons from config', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 3 });
      const sections = createMockSections([2, 2]); // 4 lessons total

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.totalLessons).toBe(4);
      expect(result.minimumRequired).toBe(3);
    });

    it('should handle empty sections array', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 5 });

      const result = validator.validateSections([]);

      expect(result.passed).toBe(false);
      expect(result.totalLessons).toBe(0);
      expect(result.deficit).toBe(5);
    });

    it('should handle sections with no lessons', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 3 });
      const sections = createMockSections([0, 0, 5]); // 5 lessons, 2 empty sections

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.totalLessons).toBe(5);
      expect(result.sectionBreakdown).toHaveLength(3);
    });
  });

  describe('validateSections - Section Breakdown', () => {
    it('should calculate correct section breakdown', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 5 });
      const sections = createMockSections([3, 2, 4]); // 9 total

      const result = validator.validateSections(sections);

      expect(result.sectionBreakdown).toHaveLength(3);
      expect(result.sectionBreakdown[0]).toEqual({
        sectionId: 'section-1',
        sectionTitle: 'Section 1',
        lessonCount: 3,
      });
      expect(result.sectionBreakdown[1]).toEqual({
        sectionId: 'section-2',
        sectionTitle: 'Section 2',
        lessonCount: 2,
      });
      expect(result.sectionBreakdown[2]).toEqual({
        sectionId: 'section-3',
        sectionTitle: 'Section 3',
        lessonCount: 4,
      });
    });
  });

  describe('validateSections - Recommendations', () => {
    it('should provide recommendations when validation fails', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
      const sections = createMockSections([2, 1, 2]); // 5 lessons (deficit: 5)

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(false);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations?.some(r => r.includes('Add 5 more lessons'))).toBe(true);
    });

    it('should warn about sections with low lesson counts', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
      const sections = createMockSections([1, 1, 5]); // 7 lessons, 2 sections with <3 lessons

      const result = validator.validateSections(sections);

      expect(result.recommendations?.some(r => r.includes('fewer than 3 lessons'))).toBe(true);
    });

    it('should warn about empty sections', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
      const sections = createMockSections([0, 5, 0]); // 5 lessons, 2 empty sections

      const result = validator.validateSections(sections);

      expect(result.recommendations?.some(r => r.includes('no lessons'))).toBe(true);
    });
  });

  describe('validateSections - Strict Mode', () => {
    it('should throw error in strict mode when validation fails', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 10,
        strictMode: true,
      });
      const sections = createMockSections([2, 2]); // 4 lessons

      expect(() => validator.validateSections(sections)).toThrow('FR-015 validation failed');
    });

    it('should not throw in strict mode when validation passes', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        strictMode: true,
      });
      const sections = createMockSections([3, 3]); // 6 lessons

      expect(() => validator.validateSections(sections)).not.toThrow();
    });
  });
});

// ============================================================================
// MAX LESSONS VALIDATION TESTS
// ============================================================================

describe('MinimumLessonsValidator - Max Lessons with Tolerance', () => {
  describe('validateSections - Max Lessons Warning', () => {
    it('should NOT set maxExceeded when within max limit', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        maxLessons: 10,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([3, 3, 3]); // 9 lessons (within 10)

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeFalsy();
      expect(result.maximumAllowed).toBe(10);
    });

    it('should NOT set maxExceeded when within 20% tolerance', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        maxLessons: 10,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([4, 4, 4]); // 12 lessons (120% of 10, exactly at tolerance)

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeFalsy();
    });

    it('should set maxExceeded when exceeding 20% tolerance', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        maxLessons: 10,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([5, 5, 3]); // 13 lessons (130% of 10, exceeds 120%)

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true); // Still passes (non-blocking)
      expect(result.maxExceeded).toBe(true);
      expect(result.excessPercentage).toBe(30); // (13-10)/10 * 100 = 30%
      expect(result.maximumAllowed).toBe(10);
    });

    it('should use custom tolerance percentage', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        maxLessons: 10,
        maxLessonsTolerancePercent: 50, // 50% tolerance
      });
      const sections = createMockSections([5, 5, 3]); // 13 lessons (130%, within 150%)

      const result = validator.validateSections(sections);

      expect(result.maxExceeded).toBeFalsy(); // Within 50% tolerance
    });

    it('should not check maxLessons when not configured', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        // maxLessons not set
      });
      const sections = createMockSections([10, 10, 10]); // 30 lessons

      const result = validator.validateSections(sections);

      expect(result.maxExceeded).toBeUndefined();
      expect(result.maximumAllowed).toBeUndefined();
    });

    it('should calculate correct excess percentage for large excess', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 5,
        maxLessons: 10,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([10, 10]); // 20 lessons (200% of 10)

      const result = validator.validateSections(sections);

      expect(result.maxExceeded).toBe(true);
      expect(result.excessPercentage).toBe(100); // (20-10)/10 * 100 = 100%
    });
  });
});

// ============================================================================
// V2 SPECS VALIDATION TESTS
// ============================================================================

describe('MinimumLessonsValidator - V2 Specs', () => {
  describe('validateV2Specs - Basic Validation', () => {
    it('should pass when V2 specs count >= minimum', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 5 });
      const specs = createMockV2Specs([2, 3, 2]); // 7 total

      const result = validator.validateV2Specs(specs);

      expect(result.passed).toBe(true);
      expect(result.totalLessons).toBe(7);
    });

    it('should fail when V2 specs count < minimum', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
      const specs = createMockV2Specs([2, 2]); // 4 total

      const result = validator.validateV2Specs(specs);

      expect(result.passed).toBe(false);
      expect(result.totalLessons).toBe(4);
      expect(result.deficit).toBe(6);
    });

    it('should group V2 specs by section correctly', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 3 });
      const specs = createMockV2Specs([3, 2, 1]); // 6 total

      const result = validator.validateV2Specs(specs);

      expect(result.sectionBreakdown).toHaveLength(3);
      expect(result.sectionBreakdown.find(s => s.sectionId === 'section-1')?.lessonCount).toBe(3);
      expect(result.sectionBreakdown.find(s => s.sectionId === 'section-2')?.lessonCount).toBe(2);
      expect(result.sectionBreakdown.find(s => s.sectionId === 'section-3')?.lessonCount).toBe(1);
    });

    it('should handle empty V2 specs array', () => {
      const validator = new MinimumLessonsValidator({ minimumLessons: 5 });

      const result = validator.validateV2Specs([]);

      expect(result.passed).toBe(false);
      expect(result.totalLessons).toBe(0);
      expect(result.deficit).toBe(5);
    });
  });

  describe('validateV2Specs - Max Lessons Warning', () => {
    it('should set maxExceeded for V2 specs when exceeding tolerance', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 3,
        maxLessons: 5,
        maxLessonsTolerancePercent: 20,
      });
      const specs = createMockV2Specs([3, 3, 2]); // 8 total (160% of 5, exceeds 120%)

      const result = validator.validateV2Specs(specs);

      expect(result.passed).toBe(true); // Non-blocking
      expect(result.maxExceeded).toBe(true);
      expect(result.excessPercentage).toBe(60); // (8-5)/5 * 100 = 60%
    });

    it('should NOT set maxExceeded for V2 specs within tolerance', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 3,
        maxLessons: 10,
        maxLessonsTolerancePercent: 20,
      });
      const specs = createMockV2Specs([3, 3, 2]); // 8 total (80% of 10, within limit)

      const result = validator.validateV2Specs(specs);

      expect(result.maxExceeded).toBeFalsy();
    });
  });

  describe('validateV2Specs - Strict Mode', () => {
    it('should throw error in strict mode for V2 specs', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 10,
        strictMode: true,
      });
      const specs = createMockV2Specs([2, 2]); // 4 total

      expect(() => validator.validateV2Specs(specs)).toThrow('FR-015 validation failed');
    });
  });
});

// ============================================================================
// COURSE SIZE PRESET INTEGRATION TESTS
// ============================================================================

describe('MinimumLessonsValidator - Course Size Presets', () => {
  /**
   * Tests simulating how orchestrator uses the validator with different course_size presets
   * Based on COURSE_SIZE_PRESETS from @megacampus/shared-types/course-size
   */

  describe('MICRO preset (1-5 lessons)', () => {
    it('should validate MICRO course with 3 lessons', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 1,
        maxLessons: 5,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([2, 1]); // 3 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeFalsy();
    });

    it('should warn when MICRO course has >6 lessons (120% of 5)', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 1,
        maxLessons: 5,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([4, 4]); // 8 lessons (exceeds 6)

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBe(true);
      expect(result.excessPercentage).toBe(60); // (8-5)/5 * 100
    });
  });

  describe('MINI preset (8-16 lessons)', () => {
    it('should validate MINI course with 12 lessons', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 8,
        maxLessons: 16,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([4, 4, 4]); // 12 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeFalsy();
    });

    it('should fail MINI course with only 5 lessons', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 8,
        maxLessons: 16,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([2, 3]); // 5 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(false);
      expect(result.deficit).toBe(3);
    });
  });

  describe('COMPACT preset (15-30 lessons)', () => {
    it('should validate COMPACT course with 22 lessons', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 15,
        maxLessons: 30,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([5, 5, 6, 6]); // 22 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeFalsy();
    });

    it('should warn COMPACT course with >36 lessons (120% of 30)', () => {
      const validator = new MinimumLessonsValidator({
        minimumLessons: 15,
        maxLessons: 30,
        maxLessonsTolerancePercent: 20,
      });
      const sections = createMockSections([10, 10, 10, 10]); // 40 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBe(true);
    });
  });

  describe('AUTO mode (fallback to 10)', () => {
    it('should use 10 as minimum for AUTO mode', () => {
      const validator = new MinimumLessonsValidator(); // No config = AUTO defaults

      const sections = createMockSections([3, 3, 4]); // 10 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.minimumRequired).toBe(10);
    });

    it('should not check maxLessons for AUTO mode', () => {
      const validator = new MinimumLessonsValidator(); // No maxLessons = no max check

      const sections = createMockSections([20, 20, 20]); // 60 lessons

      const result = validator.validateSections(sections);

      expect(result.passed).toBe(true);
      expect(result.maxExceeded).toBeUndefined();
      expect(result.maximumAllowed).toBeUndefined();
    });
  });
});
