/**
 * Unit Tests for rotateHookStrategy (v2-converter.ts)
 *
 * rotateHookStrategy ensures variety between hook strategies within a section:
 * - lessonIndex 0 always returns the inferred strategy unchanged
 * - lessonIndex > 0 cycles through all strategies excluding the inferred one
 * - The cycle wraps around (lesson 4 repeats lesson 1's result)
 * - Different inferred strategies produce different rotation orders
 *
 * @module tests/unit/stages/stage5-generation/utils/rotate-hook-strategy.test
 */

import { describe, it, expect } from 'vitest';
import {
  rotateHookStrategy,
  HOOK_STRATEGIES,
} from '@/stages/stage5-generation/utils/section-batch/v2-converter';

describe('rotateHookStrategy - lessonIndex 0 always returns inferred', () => {
  it('should return inferred strategy as-is when lessonIndex is 0 (question)', () => {
    expect(rotateHookStrategy('question', 0)).toBe('question');
  });

  it('should return inferred strategy as-is when lessonIndex is 0 (challenge)', () => {
    expect(rotateHookStrategy('challenge', 0)).toBe('challenge');
  });

  it('should return inferred strategy as-is when lessonIndex is 0 (analogy)', () => {
    expect(rotateHookStrategy('analogy', 0)).toBe('analogy');
  });

  it('should return inferred strategy as-is when lessonIndex is 0 (statistic)', () => {
    expect(rotateHookStrategy('statistic', 0)).toBe('statistic');
  });
});

describe('rotateHookStrategy - lessonIndex > 0 never returns inferred', () => {
  it('should never return the inferred strategy for lessons 1 through 6', () => {
    const strategies = ['question', 'analogy', 'statistic', 'challenge'] as const;

    for (const inferred of strategies) {
      for (let i = 1; i <= 6; i++) {
        expect(
          rotateHookStrategy(inferred, i),
          `rotateHookStrategy('${inferred}', ${i}) should not return '${inferred}'`
        ).not.toBe(inferred);
      }
    }
  });
});

describe('rotateHookStrategy - rotation variety', () => {
  it('should use all 3 non-inferred strategies within the first 3 lessons', () => {
    const results = new Set<string>();

    for (let i = 1; i <= 3; i++) {
      results.add(rotateHookStrategy('question', i));
    }

    expect(results.size).toBe(3);
    expect(results.has('question')).toBe(false);
  });

  it('should cover all strategies except inferred for a different inferred value', () => {
    const results = new Set<string>();

    for (let i = 1; i <= 3; i++) {
      results.add(rotateHookStrategy('challenge', i));
    }

    expect(results.size).toBe(3);
    expect(results.has('challenge')).toBe(false);
  });

  it('should only produce values that exist in HOOK_STRATEGIES', () => {
    for (let i = 0; i <= 6; i++) {
      const result = rotateHookStrategy('question', i);
      expect(HOOK_STRATEGIES).toContain(result);
    }
  });
});

describe('rotateHookStrategy - wrap-around (cycle)', () => {
  it('should cycle back: lesson 4 matches lesson 1 (wrap-around with 3 alternatives)', () => {
    const l1 = rotateHookStrategy('question', 1);
    const l4 = rotateHookStrategy('question', 4);

    expect(l4).toBe(l1);
    expect(l4).not.toBe('question');
  });

  it('should cycle: lesson 5 matches lesson 2', () => {
    const l2 = rotateHookStrategy('question', 2);
    const l5 = rotateHookStrategy('question', 5);

    expect(l5).toBe(l2);
  });

  it('should cycle: lesson 6 matches lesson 3', () => {
    const l3 = rotateHookStrategy('question', 3);
    const l6 = rotateHookStrategy('question', 6);

    expect(l6).toBe(l3);
  });

  it('should wrap-around for a different inferred strategy (challenge)', () => {
    const l1 = rotateHookStrategy('challenge', 1);
    const l4 = rotateHookStrategy('challenge', 4);

    expect(l4).toBe(l1);
    expect(l4).not.toBe('challenge');
  });
});

describe('rotateHookStrategy - different inferred strategies produce different rotation orders', () => {
  it('question and challenge produce different rotation sequences for lessons 1–3', () => {
    const questResults = [1, 2, 3].map(i => rotateHookStrategy('question', i));
    const challResults = [1, 2, 3].map(i => rotateHookStrategy('challenge', i));

    expect(questResults).not.toEqual(challResults);
  });

  it('analogy and statistic produce different rotation sequences for lessons 1–3', () => {
    const analogyResults = [1, 2, 3].map(i => rotateHookStrategy('analogy', i));
    const statisticResults = [1, 2, 3].map(i => rotateHookStrategy('statistic', i));

    expect(analogyResults).not.toEqual(statisticResults);
  });
});
