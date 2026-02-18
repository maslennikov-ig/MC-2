import { describe, it, expect } from 'vitest';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { runHeuristicFilters } from '@/stages/stage6-lesson-content/judge/cascade/heuristic-helpers';
import type { HeuristicThresholds } from '@/stages/stage6-lesson-content/judge/cascade/types';

const RELAXED_THRESHOLDS: HeuristicThresholds = {
  minWordCount: 0,
  maxWordCount: 100_000,
  targetFleschKincaid: { min: -100, max: 100 },
  requiredSections: [],
  minExamples: 0,
  minExercises: 0,
};

function createLessonContent(contentText: string): LessonContentBody {
  return {
    intro:
      'Это достаточно длинное введение для теста эвристик, чтобы избежать лишних побочных эффектов.',
    sections: [
      {
        title: 'Основной раздел',
        content: contentText,
      },
    ],
    examples: [],
    exercises: [],
  } as LessonContentBody;
}

function createLessonSpec(objectives: string[]): LessonSpecificationV2 {
  return {
    lesson_id: 'test-lesson-id',
    estimated_duration_minutes: 15,
    learning_objectives: objectives.map((objective, index) => ({
      id: `lo-${index + 1}`,
      objective,
      bloom_level: 'understand',
    })),
  } as LessonSpecificationV2;
}

describe('cascade heuristic keyword helpers', () => {
  it('matches Russian declension forms via stemming fallback for Cyrillic keywords', () => {
    const content = createLessonContent(
      'В этом разделе рассматривается идея эвдемонии как центральная категория в этике.'
    );
    const lessonSpec = createLessonSpec(['эвдемония']);

    const result = runHeuristicFilters(content, lessonSpec, RELAXED_THRESHOLDS, 'ru');

    expect(result.keywordCoverage).toBe(1);
    expect(result.failureReasons.some(reason => reason.includes('Keyword coverage'))).toBe(false);
  });

  it('excludes Bloom verbs (EN + RU) from keyword denominator', () => {
    const content = createLessonContent(
      'caching improves performance in distributed systems. структура данных важна для скорости поиска.'
    );
    const lessonSpec = createLessonSpec([
      'Explain analyze evaluate caching',
      'Объяснить проанализировать запомнить структура',
    ]);

    const result = runHeuristicFilters(content, lessonSpec, RELAXED_THRESHOLDS, 'ru');

    expect(result.keywordCoverage).toBe(1);
  });

  it('passes keyword coverage at 40 percent with 35 percent threshold', () => {
    const content = createLessonContent('alpha and beta are covered in this lesson content.');
    const lessonSpec = createLessonSpec(['alpha beta gamma delta epsilon']);

    const result = runHeuristicFilters(content, lessonSpec, RELAXED_THRESHOLDS, 'ru');

    expect(result.keywordCoverage).toBeCloseTo(0.4, 5);
    expect(result.failureReasons.some(reason => reason.includes('Keyword coverage'))).toBe(false);
  });

  it('fails below 35 percent with updated failure reason text', () => {
    const content = createLessonContent('alpha appears but other objectives are missing.');
    const lessonSpec = createLessonSpec(['alpha beta gamma']);

    const result = runHeuristicFilters(content, lessonSpec, RELAXED_THRESHOLDS, 'ru');

    expect(result.keywordCoverage).toBeCloseTo(1 / 3, 5);
    expect(result.failureReasons).toContain('Keyword coverage (33%) below 35% threshold');
  });

  it('keeps Latin behavior as exact-match only (no stemming fallback)', () => {
    const content = createLessonContent('This lesson discusses normalized schemas and trade-offs.');
    const lessonSpec = createLessonSpec(['normalization']);

    const result = runHeuristicFilters(content, lessonSpec, RELAXED_THRESHOLDS, 'ru');

    expect(result.keywordCoverage).toBe(0);
  });
});
