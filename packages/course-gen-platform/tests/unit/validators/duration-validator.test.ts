/**
 * Unit tests for Duration Validator
 *
 * RT-007 Phase 1: Tests duration proportionality with improvements
 * - Difficulty level multiplier (beginner: 1.0x, intermediate: 1.5x, advanced: 2.0x)
 * - ENGAGEMENT_CAP changed from ERROR to INFO (doesn't block)
 * - MAX duration changed from ERROR to WARNING (allows complex topics)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateExpectedDuration,
  validateDurationProportionality,
  MIN_TOPIC_DURATION,
  MAX_TOPIC_DURATION,
  MIN_OBJECTIVE_DURATION,
  MAX_OBJECTIVE_DURATION,
  ENGAGEMENT_CAP,
  DIFFICULTY_MULTIPLIER
} from '../../../src/services/stage5/validators/duration-validator';

describe('Duration Validator - Difficulty Multiplier', () => {
  // Spy on console methods
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  describe('calculateExpectedDuration', () => {
    it('should calculate base duration for intermediate level (default)', () => {
      const result = calculateExpectedDuration(2, 1);

      // Base: 2×2 + 1×5 = 9, 2×5 + 1×15 = 25
      // Intermediate multiplier: 1.5x
      // Expected: 9×1.5 = 13.5 → 14, 25×1.5 = 37.5 → 38
      expect(result.min).toBe(14);
      expect(result.max).toBe(38);
    });

    it('should apply beginner multiplier (1.0x)', () => {
      const result = calculateExpectedDuration(2, 1, 'beginner');

      // Base: 2×2 + 1×5 = 9, 2×5 + 1×15 = 25
      // Beginner multiplier: 1.0x
      expect(result.min).toBe(9);
      expect(result.max).toBe(25);
    });

    it('should apply intermediate multiplier (1.5x)', () => {
      const result = calculateExpectedDuration(2, 1, 'intermediate');

      // Base: 2×2 + 1×5 = 9, 2×5 + 1×15 = 25
      // Intermediate multiplier: 1.5x
      expect(result.min).toBe(14); // ceil(9 × 1.5) = 14
      expect(result.max).toBe(38); // ceil(25 × 1.5) = 38
    });

    it('should apply advanced multiplier (2.0x)', () => {
      const result = calculateExpectedDuration(2, 1, 'advanced');

      // Base: 2×2 + 1×5 = 9, 2×5 + 1×15 = 25
      // Advanced multiplier: 2.0x
      expect(result.min).toBe(18); // 9 × 2.0 = 18
      expect(result.max).toBe(50); // 25 × 2.0 = 50
    });

    it('should handle complex lessons with multiple topics and objectives', () => {
      const result = calculateExpectedDuration(4, 3, 'advanced');

      // Base: 4×2 + 3×5 = 23, 4×5 + 3×15 = 65
      // Advanced multiplier: 2.0x
      expect(result.min).toBe(46); // 23 × 2.0 = 46
      expect(result.max).toBe(130); // 65 × 2.0 = 130
    });
  });

  describe('validateDurationProportionality', () => {
    it('should pass for beginner lesson with correct duration', () => {
      const lesson = {
        key_topics: ['Variables', 'Data types'],
        lesson_objectives: [{ text: 'Define variables' }],
        estimated_duration_minutes: 9, // 2×2 + 1×5 = 9 (exact min)
        difficulty_level: 'beginner' as const
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(true); // ✅ 9 min OK for beginner
      expect(result.issues).toBeUndefined();
    });

    it('should pass for advanced lesson with correct duration', () => {
      const lesson = {
        key_topics: ['Metaprogramming', 'Decorators'],
        lesson_objectives: [{ text: 'Implement decorators' }],
        estimated_duration_minutes: 18, // (2×2 + 1×5) × 2.0 = 18
        difficulty_level: 'advanced' as const
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(true); // ✅ 18 min OK for advanced
      expect(result.issues).toBeUndefined();
    });

    it('should block if duration too short (below MIN)', () => {
      const lesson = {
        key_topics: ['Variables', 'Data types'],
        lesson_objectives: [{ text: 'Define variables' }],
        estimated_duration_minutes: 5, // Below MIN (9 for beginner)
        difficulty_level: 'beginner' as const
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(false); // ❌ Too short
      expect(result.issues).toBeDefined();
      expect(result.issues![0]).toContain('too short');
      expect(result.issues![0]).toContain('5 min');
    });

    it('should NOT block if duration exceeds MAX (just warns)', () => {
      const lesson = {
        key_topics: ['Variables', 'Data types'],
        lesson_objectives: [{ text: 'Define variables' }],
        estimated_duration_minutes: 40, // Above MAX (25 for beginner)
        difficulty_level: 'beginner' as const
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(true); // ✅ NOT blocked (RT-007 change)
      expect(result.warnings).toBeDefined(); // ⚠️ Returns warnings in ValidationResult
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it('should NOT block on ENGAGEMENT_CAP (just logs INFO)', () => {
      const complexLesson = {
        key_topics: ['Async', 'Promises', 'Event Loop', 'Callbacks'],
        lesson_objectives: [
          { text: 'Explain event loop' },
          { text: 'Implement promises' },
          { text: 'Debug async errors' }
        ],
        estimated_duration_minutes: 35 // Exceeds ENGAGEMENT_CAP (6 min)
      };

      const result = validateDurationProportionality(complexLesson);

      expect(result.passed).toBe(true); // ✅ NOT blocked (RT-007 change)
      expect(result.info).toBeDefined(); // ℹ️ Returns info in ValidationResult
      expect(result.info!.length).toBeGreaterThan(0);
    });

    it('should default to intermediate if difficulty_level not provided', () => {
      const lesson = {
        key_topics: ['Variables', 'Data types'],
        lesson_objectives: [{ text: 'Define variables' }],
        estimated_duration_minutes: 14 // Matches intermediate MIN
        // No difficulty_level provided
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(true); // ✅ Uses intermediate multiplier (1.5x)
    });

    it('should handle edge case: minimum viable lesson', () => {
      const lesson = {
        key_topics: ['Topic 1', 'Topic 2'], // Min 2 topics
        lesson_objectives: [{ text: 'Objective 1' }], // Min 1 objective
        estimated_duration_minutes: 9, // Beginner: 2×2 + 1×5 = 9
        difficulty_level: 'beginner' as const
      };

      const result = validateDurationProportionality(lesson);

      expect(result.passed).toBe(true);
    });

    it('should handle edge case: complex advanced lesson', () => {
      const lesson = {
        key_topics: ['T1', 'T2', 'T3', 'T4', 'T5'], // 5 topics
        lesson_objectives: [
          { text: 'O1' },
          { text: 'O2' },
          { text: 'O3' },
          { text: 'O4' }
        ], // 4 objectives
        estimated_duration_minutes: 70, // Advanced: (5×2 + 4×5) × 2 = 60, within range
        difficulty_level: 'advanced' as const
      };

      const result = validateDurationProportionality(lesson);

      // Base: 5×2 + 4×5 = 30 min
      // Advanced multiplier: 30 × 2 = 60 min (MIN)
      // MAX: (5×5 + 4×15) × 2 = 170 min
      // 70 min is within range [60, 170]
      expect(result.passed).toBe(true);
    });
  });

  describe('DIFFICULTY_MULTIPLIER constants', () => {
    it('should have correct multiplier values', () => {
      expect(DIFFICULTY_MULTIPLIER.beginner).toBe(1.0);
      expect(DIFFICULTY_MULTIPLIER.intermediate).toBe(1.5);
      expect(DIFFICULTY_MULTIPLIER.advanced).toBe(2.0);
    });
  });

  describe('Duration constants', () => {
    it('should have correct RT-006 values', () => {
      expect(MIN_TOPIC_DURATION).toBe(2);
      expect(MAX_TOPIC_DURATION).toBe(5);
      expect(MIN_OBJECTIVE_DURATION).toBe(5);
      expect(MAX_OBJECTIVE_DURATION).toBe(15);
      expect(ENGAGEMENT_CAP).toBe(6);
    });
  });
});
