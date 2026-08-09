import { describe, expect, it } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import {
  checkContentDensity,
  runHeuristicFilters,
  type HeuristicFilterConfig,
} from '@/stages/stage6-lesson-content/judge/heuristic-filter';

const RELAXED_CONFIG: Partial<HeuristicFilterConfig> = {
  wordCount: { min: 1, max: 50_000 },
  fleschKincaid: { min: -100, max: 100, target: 10 },
  requiredSections: [],
  keywordCoverageThreshold: 0,
  contentDensityThreshold: 1,
};

function createLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: 'section-count-regression',
    title: 'Section count regression',
    learning_objectives: [{ objective: 'Explain deterministic lesson structure validation' }],
    sections: [{ id: 'main-section', title: 'Main section' }],
    metadata: {
      target_audience: 'practitioner',
      tone: 'professional',
    },
  } as LessonSpecificationV2;
}

describe('Stage 6 heuristic section count', () => {
  it('returns zero for a lesson title followed only by introduction text', () => {
    const content = `# Lesson title

This introduction contains the entire lesson and has no content-section heading.`;

    const result = checkContentDensity(content, 1);

    expect(result.sectionCount).toBe(0);
    expect(result.avgWordsPerSection).toBe(0);
  });

  it('makes the existing emptySections guard reject an intro-only lesson', () => {
    const content = `# Lesson title

This introduction contains the entire lesson and has no content-section heading.`;

    const result = runHeuristicFilters(content, createLessonSpec(), RELAXED_CONFIG);

    expect(result.metrics.sectionCount).toBe(0);
    expect(result.failures).toContainEqual(
      expect.objectContaining({ filter: 'emptySections', severity: 'critical' })
    );
  });

  it('counts H2 content sections exactly without counting H1 or nested H3 headings', () => {
    const content = `# Lesson title

Introduction text.

## First content section

First section body.

### Nested detail

Nested detail body.

## Second content section

Second section body.`;

    const result = checkContentDensity(content, 1);

    expect(result.sectionCount).toBe(2);
  });
});
