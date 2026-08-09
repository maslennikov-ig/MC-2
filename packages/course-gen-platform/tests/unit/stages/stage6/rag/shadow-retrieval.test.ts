import { describe, expect, it } from 'vitest';
import {
  getTier1ShadowCohortBucket,
  parseTier1ShadowRetrievalRate,
  resolveTier1ShadowSelection,
} from '@/stages/stage6-lesson-content/rag/shadow-retrieval';

describe('Tier 1 shadow retrieval rollout', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['0', 0],
    ['0.05', 0.05],
    ['1', 1],
    [' 0.25 ', 0.25],
  ])('parses %s as %s', (value, expected) => {
    expect(parseTier1ShadowRetrievalRate(value)).toBe(expected);
  });

  it.each(['-0.1', '.05', '1.01', 'NaN', '5', '1e-2'])('fails closed for %s', value => {
    expect(parseTier1ShadowRetrievalRate(value)).toBe(0);
  });

  it('keeps the lesson cohort stable and bounded', () => {
    const first = getTier1ShadowCohortBucket('Course-A', 'Lesson-1');
    const retry = getTier1ShadowCohortBucket('course-a', 'lesson-1');

    expect(retry).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(10_000);
  });

  it('never selects zero rate and always selects full rate', () => {
    expect(resolveTier1ShadowSelection('course', 'lesson', '0')).toEqual({
      rate: 0,
      sampled: false,
    });
    expect(resolveTier1ShadowSelection('course', 'lesson', '1')).toEqual({
      rate: 1,
      sampled: true,
    });
  });
});
