/**
 * Tests for stage5-generation/validators/duration-validator.ts
 *
 * Pure computation tests:
 * - calculateExpectedDuration: RT-006 formula with RT-007 difficulty multipliers
 * - validateDurationProportionality: ERROR/WARNING/INFO severity logic
 * - Constants: DIFFICULTY_MULTIPLIER, duration constants
 */

import { describe, it, expect } from 'vitest';
import {
  calculateExpectedDuration,
  validateDurationProportionality,
  DIFFICULTY_MULTIPLIER,
  MIN_TOPIC_DURATION,
  MAX_TOPIC_DURATION,
  MIN_OBJECTIVE_DURATION,
  MAX_OBJECTIVE_DURATION,
  ENGAGEMENT_CAP,
} from '@/stages/stage5-generation/validators/duration-validator';
import { ValidationSeverity } from '@megacampus/shared-types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

describe('Duration validator constants', () => {
  it('has expected base constants', () => {
    expect(MIN_TOPIC_DURATION).toBe(2);
    expect(MAX_TOPIC_DURATION).toBe(5);
    expect(MIN_OBJECTIVE_DURATION).toBe(5);
    expect(MAX_OBJECTIVE_DURATION).toBe(15);
    expect(ENGAGEMENT_CAP).toBe(6);
  });

  it('has expected difficulty multipliers', () => {
    expect(DIFFICULTY_MULTIPLIER.beginner).toBe(1.0);
    expect(DIFFICULTY_MULTIPLIER.intermediate).toBe(1.5);
    expect(DIFFICULTY_MULTIPLIER.advanced).toBe(2.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateExpectedDuration
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateExpectedDuration', () => {
  it('calculates correct range for beginner level', () => {
    // 2 topics, 2 objectives, beginner (1.0x)
    // min = (2*2 + 2*5) * 1.0 = 4 + 10 = 14
    // max = (2*5 + 2*15) * 1.0 = 10 + 30 = 40
    const result = calculateExpectedDuration(2, 2, 'beginner');
    expect(result.min).toBe(14);
    expect(result.max).toBe(40);
  });

  it('applies intermediate multiplier (1.5x)', () => {
    // 2 topics, 2 objectives, intermediate (1.5x)
    // base min = 14, base max = 40
    // with 1.5x: min = ceil(21) = 21, max = ceil(60) = 60
    const result = calculateExpectedDuration(2, 2, 'intermediate');
    expect(result.min).toBe(21);
    expect(result.max).toBe(60);
  });

  it('applies advanced multiplier (2.0x)', () => {
    // 2 topics, 2 objectives, advanced (2.0x)
    // base min = 14 * 2.0 = 28, base max = 40 * 2.0 = 80
    const result = calculateExpectedDuration(2, 2, 'advanced');
    expect(result.min).toBe(28);
    expect(result.max).toBe(80);
  });

  it('defaults to intermediate when no level specified', () => {
    const withDefault = calculateExpectedDuration(3, 1);
    const withExplicit = calculateExpectedDuration(3, 1, 'intermediate');
    expect(withDefault.min).toBe(withExplicit.min);
    expect(withDefault.max).toBe(withExplicit.max);
  });

  it('returns larger ranges for more topics', () => {
    const few = calculateExpectedDuration(1, 1);
    const many = calculateExpectedDuration(5, 5);
    expect(many.min).toBeGreaterThan(few.min);
    expect(many.max).toBeGreaterThan(few.max);
  });

  it('min is always less than max', () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
      const result = calculateExpectedDuration(3, 3, difficulty);
      expect(result.min).toBeLessThan(result.max);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateDurationProportionality
// ─────────────────────────────────────────────────────────────────────────────

function makeLesson(overrides: {
  key_topics?: string[];
  lesson_objectives?: unknown[];
  estimated_duration_minutes: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
}) {
  return {
    key_topics: overrides.key_topics || ['topic1', 'topic2'],
    lesson_objectives: overrides.lesson_objectives || ['obj1', 'obj2'],
    estimated_duration_minutes: overrides.estimated_duration_minutes,
    difficulty_level: overrides.difficulty_level,
  };
}

describe('validateDurationProportionality', () => {
  it('returns passed=true and INFO for valid duration', () => {
    // 2 topics, 2 objectives, beginner => min=14, max=40
    // A duration of 20 min is within range
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 20,
      difficulty_level: 'beginner',
    }));
    expect(result.passed).toBe(true);
    expect(result.severity).toBe(ValidationSeverity.INFO);
    expect(result.score).toBe(1.0);
  });

  it('returns ERROR when duration is too short', () => {
    // 2 topics, 2 objectives, beginner => min=14
    // A duration of 5 min is too short
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 5,
      difficulty_level: 'beginner',
    }));
    expect(result.passed).toBe(false);
    expect(result.severity).toBe(ValidationSeverity.ERROR);
    expect(result.issues).toBeDefined();
    expect(result.issues!.length).toBeGreaterThan(0);
    expect(result.issues![0]).toContain('too short');
  });

  it('returns WARNING (passed=true) when duration exceeds max', () => {
    // 2 topics, 2 objectives, beginner => max=40
    // A duration of 100 min exceeds max but passes
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 100,
      difficulty_level: 'beginner',
    }));
    expect(result.passed).toBe(true);
    expect(result.severity).toBe(ValidationSeverity.WARNING);
    expect(result.score).toBe(0.9);
  });

  it('returns INFO when duration exceeds engagement cap but within max', () => {
    // 2 topics, 3 objectives, beginner => min=14, max=55
    // Duration of 10 min > ENGAGEMENT_CAP(6) but within [14, 55]? No, 10 < 14.
    // Let's use 4 topics, 2 objectives, beginner => min=18, max=50
    // Duration of 8 min > ENGAGEMENT_CAP(6) but < min(18)?
    // Actually engagement cap is checked AFTER min/max checks.
    // So we need duration to be > cap(6) AND within [min, max].
    // 3 topics, 1 objective => min=ceil((6+5)*1.5)=17, max=ceil((15+15)*1.5)=45
    // Or beginner: min=(6+5)*1.0=11, max=(15+15)*1.0=30
    // Duration=8: 8 < 11 (min), so ERROR. Need duration > cap but within range.
    // Try: 1 topic, 1 objective, beginner => min=7, max=20, cap=6
    // duration=8: >cap(6) AND within [7,20] → INFO for engagement cap
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1'],
      lesson_objectives: ['o1'],
      estimated_duration_minutes: 8,
      difficulty_level: 'beginner',
    }));
    expect(result.passed).toBe(true);
    expect(result.severity).toBe(ValidationSeverity.INFO);
  });

  it('defaults to intermediate difficulty when not specified', () => {
    const result = validateDurationProportionality({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 30,
    });
    expect(result).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
  });

  it('score is proportional for ERROR case', () => {
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 7, // half of min (14)
      difficulty_level: 'beginner',
    }));
    expect(result.score).toBeDefined();
    expect(result.score!).toBeGreaterThan(0);
    expect(result.score!).toBeLessThan(1);
  });

  it('includes suggestion in error result', () => {
    const result = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 5,
      difficulty_level: 'beginner',
    }));
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion!).toContain('Increase duration');
  });

  it('includes metadata in result', () => {
    const result = validateDurationProportionality(makeLesson({
      estimated_duration_minutes: 20,
      difficulty_level: 'beginner',
    }));
    expect(result.metadata).toBeDefined();
    expect(result.metadata).toHaveProperty('actual', 20);
  });

  it('advanced difficulty allows longer durations before ERROR', () => {
    // Same topic/objectives, advanced multiplier means higher min
    // 2 topics, 2 objectives, advanced => min=28
    // So duration 20 is ERROR for advanced but OK for beginner
    const advancedResult = validateDurationProportionality(makeLesson({
      key_topics: ['t1', 't2'],
      lesson_objectives: ['o1', 'o2'],
      estimated_duration_minutes: 20,
      difficulty_level: 'advanced',
    }));
    expect(advancedResult.passed).toBe(false);
    expect(advancedResult.severity).toBe(ValidationSeverity.ERROR);
  });
});
