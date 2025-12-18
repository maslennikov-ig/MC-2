/**
 * Duration Validator
 *
 * Validates lesson duration proportionality based on RT-006 formula:
 * - MIN: 2-5 min per topic + 5-15 min per objective
 * - MAX: same formula, upper bound
 *
 * RT-007 Phase 1 improvements:
 * - Difficulty level multiplier (beginner: 1.0x, intermediate: 1.5x, advanced: 2.0x)
 * - ENGAGEMENT_CAP (6 min) changed from ERROR to INFO level (doesn't block)
 * - MAX duration changed from ERROR to WARNING (allows complex topics)
 *
 * RT-007 Phase 3: Severity-based validation
 * - MIN check: ERROR (blocks - cognitive overload risk)
 * - MAX check: WARNING (logs - allows complex topics)
 * - ENGAGEMENT_CAP: INFO (monitoring only)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md
 */

import { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';

/**
 * RT-006 P1: Duration proportionality constants
 */
export const MIN_TOPIC_DURATION = 2;        // minutes per topic
export const MAX_TOPIC_DURATION = 5;        // minutes per topic
export const MIN_OBJECTIVE_DURATION = 5;    // minutes per objective
export const MAX_OBJECTIVE_DURATION = 15;   // minutes per objective
export const ENGAGEMENT_CAP = 6;            // minutes max (attention span guideline)

/**
 * RT-007 P1: Difficulty level multiplier
 *
 * Adjusts duration expectations based on topic complexity:
 * - Beginner: Base formula (1.0x) - simple topics
 * - Intermediate: +50% time (1.5x) - moderate complexity
 * - Advanced: +100% time (2.0x) - complex topics requiring deeper understanding
 */
export const DIFFICULTY_MULTIPLIER = {
  beginner: 1.0,      // base formula
  intermediate: 1.5,  // +50% time
  advanced: 2.0,      // +100% time
} as const;

/**
 * Calculate expected duration range based on topics, objectives, and difficulty
 *
 * RT-007 P1: Now includes difficulty level modifier
 */
export function calculateExpectedDuration(
  topicCount: number,
  objectiveCount: number,
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): { min: number; max: number } {
  const multiplier = DIFFICULTY_MULTIPLIER[difficultyLevel];

  const baseMin = topicCount * MIN_TOPIC_DURATION + objectiveCount * MIN_OBJECTIVE_DURATION;
  const baseMax = topicCount * MAX_TOPIC_DURATION + objectiveCount * MAX_OBJECTIVE_DURATION;

  return {
    min: Math.ceil(baseMin * multiplier),
    max: Math.ceil(baseMax * multiplier)
  };
}

/**
 * Validate duration proportionality for a lesson
 *
 * RT-007 P1 changes:
 * - MIN check: Still blocks (ERROR) - prevents cognitive overload
 * - MAX check: Now WARNING only - allows complex topics to exceed
 * - ENGAGEMENT_CAP: Now INFO only - just logs, doesn't block
 *
 * RT-007 Phase 3: Returns ValidationResult with severity-based categorization
 *
 * @returns Validation result with severity-based issues
 */
export function validateDurationProportionality(
  lesson: {
    key_topics: string[];
    lesson_objectives: unknown[];
    estimated_duration_minutes: number;
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  }
): ValidationResult {
  const topicCount = lesson.key_topics.length;
  const objectiveCount = lesson.lesson_objectives.length;
  const actualDuration = lesson.estimated_duration_minutes;
  const difficultyLevel = lesson.difficulty_level || 'intermediate';

  const expected = calculateExpectedDuration(
    topicCount,
    objectiveCount,
    difficultyLevel
  );

  // MIN check (ERROR - blocks if too short)
  if (actualDuration < expected.min) {
    return {
      passed: false,
      severity: ValidationSeverity.ERROR,
      score: actualDuration / expected.min, // Proportional score
      issues: [`Duration too short: ${actualDuration} min (expected ${expected.min}-${expected.max} min for ${difficultyLevel} level)`],
      suggestion: `Increase duration to at least ${expected.min} minutes to prevent cognitive overload`,
      metadata: {
        rule: 'duration_min',
        expected: { min: expected.min, max: expected.max },
        actual: actualDuration,
      }
    };
  }

  // MAX check (WARNING - logs but doesn't block)
  // RT-007: Changed from ERROR to WARNING to allow complex topics
  if (actualDuration > expected.max) {
    return {
      passed: true, // ✅ Passed despite warning
      severity: ValidationSeverity.WARNING,
      score: 0.9, // Slightly lower score, but still valid
      warnings: [`Duration exceeds max: ${actualDuration} min (expected ${expected.min}-${expected.max} min). This is OK for complex topics.`],
      suggestion: `Consider splitting into multiple lessons if content is not complex`,
      metadata: {
        rule: 'duration_max',
        expected: { min: expected.min, max: expected.max },
        actual: actualDuration,
      }
    };
  }

  // ENGAGEMENT_CAP check (INFO level - only monitor, DON'T block)
  // RT-007: Changed from ERROR to INFO to allow complex lessons
  if (actualDuration > ENGAGEMENT_CAP) {
    return {
      passed: true,
      severity: ValidationSeverity.INFO,
      score: 1.0,
      info: [`Duration ${actualDuration} min exceeds engagement cap (${ENGAGEMENT_CAP} min). Consider adding breaks or splitting into shorter segments for better learner engagement.`],
      metadata: {
        rule: 'duration_engagement_cap',
        expected: { min: 0, max: ENGAGEMENT_CAP },
        actual: actualDuration,
      }
    };
  }

  // All checks passed
  return {
    passed: true,
    severity: ValidationSeverity.INFO,
    score: 1.0,
    info: [`Duration ${actualDuration} min is within expected range (${expected.min}-${expected.max} min)`],
    metadata: {
      rule: 'duration_proportionality',
      expected: { min: expected.min, max: expected.max },
      actual: actualDuration,
    }
  };
}
