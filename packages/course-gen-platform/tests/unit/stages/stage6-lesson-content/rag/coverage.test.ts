import { describe, expect, it } from 'vitest';
import {
  calculateLessonCoverage,
  termMatchesInContent,
} from '@/stages/stage6-lesson-content/rag/coverage';

describe('stage6 rag coverage', () => {
  it('does not throw when a short term contains regex metacharacters', () => {
    expect(() => termMatchesInContent('(cat', 'some content about cats')).not.toThrow();
    expect(termMatchesInContent('(cat', 'some content about cats')).toBe(false);
  });

  it('does not crash coverage scoring for objectives with regex metacharacters', () => {
    const chunks = [{ content: 'some content about cats', relevance_score: 0.8 }];
    const lessonSpec = {
      learning_objectives: [{ objective: '(cat' }],
    };

    expect(() => calculateLessonCoverage(chunks as never, lessonSpec as never)).not.toThrow();
    expect(calculateLessonCoverage(chunks as never, lessonSpec as never)).toBe(0);
  });
});
