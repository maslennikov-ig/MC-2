/**
 * Course Size Presets - Single Source of Truth
 * @module course-size
 *
 * Defines available course size presets for LLM recommendations.
 * These are ADVISORY - LLM may deviate if topic requires different scope.
 */

import { z } from 'zod';

// ============================================================================
// COURSE SIZE ENUM
// ============================================================================

/**
 * Course size options:
 * - auto: LLM decides optimal size based on topic (DEFAULT)
 * - micro: Minimal course for simple topics (1-5 lessons)
 * - mini: Quick overview, express introduction (8-16 lessons)
 * - compact: Small focused course (15-30 lessons)
 * - standard: Typical comprehensive course (30-50 lessons)
 * - comprehensive: Large detailed course with advanced topics (60-100 lessons)
 */
export const COURSE_SIZES = [
  'auto',
  'micro',
  'mini',
  'compact',
  'standard',
  'comprehensive',
] as const;

/** Inferred CourseSize type from array */
export type CourseSize = (typeof COURSE_SIZES)[number];

/** Zod schema for course size validation */
export const courseSizeSchema = z.enum(COURSE_SIZES);

/** Sizes that have explicit presets (excludes 'auto') */
export const PRESET_COURSE_SIZES = [
  'micro',
  'mini',
  'compact',
  'standard',
  'comprehensive',
] as const;
export type PresetCourseSize = (typeof PRESET_COURSE_SIZES)[number];

// ============================================================================
// SIZE PRESETS WITH TARGET VALUES
// ============================================================================

export interface CourseSizePreset {
  /** Size identifier */
  size: PresetCourseSize;
  /** Target lessons count (recommendation, not constraint) */
  targetLessons: number;
  /** Target sections count (recommendation, not constraint) */
  targetSections: number;
  /** Minimum lessons count (hard constraint for validation) */
  minLessons: number;
  /** Maximum lessons count (soft constraint, ±20% tolerance) */
  maxLessons: number;
  /** Estimated hours range minimum (for UI display) */
  estimatedHoursMin: number;
  /** Estimated hours range maximum (for UI display) */
  estimatedHoursMax: number;
  /** Description for LLM prompt (English, will be adapted by LLM) */
  llmGuidance: string;
}

/**
 * Course size presets with target values
 * These are recommendations - actual course structure may vary based on topic
 * Note: 'auto' is not included - it means LLM decides without guidance
 */
export const COURSE_SIZE_PRESETS: Record<PresetCourseSize, CourseSizePreset> = {
  micro: {
    size: 'micro',
    targetLessons: 3,
    targetSections: 1,
    minLessons: 1, // MICRO can have as few as 1 lesson
    maxLessons: 5,
    estimatedHoursMin: 0.25,
    estimatedHoursMax: 1,
    llmGuidance:
      'Create a minimal micro-course with 1-5 lessons in 1 section. ' +
      'This is for very simple topics that need only the absolute essentials. ' +
      'Cover only the core concept - no background, no advanced topics, just the minimum viable knowledge.',
  },
  mini: {
    size: 'mini',
    targetLessons: 10,
    targetSections: 3,
    minLessons: 8, // MINI minimum is 8 lessons
    maxLessons: 16,
    estimatedHoursMin: 1,
    estimatedHoursMax: 3,
    llmGuidance:
      'Create a quick overview course with 8-16 lessons in 3 sections. ' +
      'Focus on essential concepts only - this is an express introduction, not comprehensive coverage. ' +
      'Keep explanations concise and skip advanced topics.',
  },
  compact: {
    size: 'compact',
    targetLessons: 20,
    targetSections: 5,
    minLessons: 15, // COMPACT minimum is 15 lessons
    maxLessons: 30,
    estimatedHoursMin: 3,
    estimatedHoursMax: 8,
    llmGuidance:
      'Create a compact course with 15-30 lessons in 4-6 sections. ' +
      'Cover core concepts with moderate depth. Include practical examples but avoid extensive case studies. ' +
      'Skip very advanced or niche topics.',
  },
  standard: {
    size: 'standard',
    targetLessons: 40,
    targetSections: 8,
    minLessons: 30, // STANDARD minimum is 30 lessons
    maxLessons: 50,
    estimatedHoursMin: 8,
    estimatedHoursMax: 20,
    llmGuidance:
      'Create a standard-sized course with 30-50 lessons in 6-10 sections. ' +
      'Provide thorough coverage with practical examples, exercises, and some advanced topics. ' +
      'Balance breadth and depth appropriately for the subject matter.',
  },
  comprehensive: {
    size: 'comprehensive',
    targetLessons: 80,
    targetSections: 15,
    minLessons: 60, // COMPREHENSIVE minimum is 60 lessons
    maxLessons: 100,
    estimatedHoursMin: 20,
    estimatedHoursMax: 50,
    llmGuidance:
      'Create a comprehensive course with 60-100 lessons in 12-18 sections. ' +
      'Provide in-depth coverage including advanced topics, extensive examples, case studies, and practical projects. ' +
      'Include edge cases, best practices, and expert-level insights.',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get course size preset configuration
 * Returns undefined for 'auto' (LLM decides without guidance)
 * @param size - Course size identifier
 */
export function getCourseSizePreset(size: CourseSize): CourseSizePreset | undefined {
  if (size === 'auto') return undefined;
  return COURSE_SIZE_PRESETS[size];
}

/**
 * Validate if a string is a valid course size
 * @param size - String to validate
 */
export function isValidCourseSize(size: string): size is CourseSize {
  return courseSizeSchema.safeParse(size).success;
}

/**
 * Default course size when user doesn't select one
 * 'auto' lets LLM analyze topic and decide optimal structure
 */
export const DEFAULT_COURSE_SIZE: CourseSize = 'auto';

// ============================================================================
// I18N LABELS
// ============================================================================

// The 19-language label tables live next door; re-exported here so that
// `CourseSizeLabel`, `COURSE_SIZE_LABELS`, `getCourseSizeLabels`,
// `getAllCourseSizeLabels`, `CourseSizeUILabels`, `COURSE_SIZE_UI_LABELS` and
// `getCourseSizeUILabels` keep the import path they have always had.
export * from './course-size-labels';
