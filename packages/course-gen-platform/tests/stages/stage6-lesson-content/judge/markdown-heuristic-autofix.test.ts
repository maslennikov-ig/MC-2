/**
 * Tests for markdown/table auto-fix behavior in heuristic path
 * @module stages/stage6-lesson-content/judge/markdown-heuristic-autofix.test
 */

import { describe, expect, it } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import {
  runHeuristicFilters,
  type HeuristicFilterConfig,
} from '../../../../src/stages/stage6-lesson-content/judge/heuristic-filter.js';
import { getRuleSeverity } from '../../../../src/stages/stage6-lesson-content/judge/markdownlint-severity.js';

const RELAXED_CONFIG: Partial<HeuristicFilterConfig> = {
  wordCount: { min: 1, max: 50_000 },
  fleschKincaid: { min: 0, max: 20, target: 10 },
  requiredSections: [],
  keywordCoverageThreshold: 0,
  contentDensityThreshold: 1,
};

function createLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: 'test-heuristic-autofix',
    title: 'Heuristic Auto-fix',
    learning_objectives: [
      { objective: 'Explain workflow automation and deterministic table normalization' },
    ],
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
      },
    ],
    metadata: {
      target_audience: 'practitioner',
      tone: 'professional',
    },
  } as LessonSpecificationV2;
}

describe('heuristic markdown auto-fixes', () => {
  it('should apply cosmetic markdown auto-fixes before markdown scoring', () => {
    const content = `# Lesson Title

## Introduction

This lesson covers workflow automation and deterministic table normalization in practice.
This sentence has trailing spaces.   
This\tline\tcontains tabs that should be normalized.

## Conclusion

Workflow automation and deterministic table normalization remain consistent after cleanup.
`;

    const result = runHeuristicFilters(content, createLessonSpec(), RELAXED_CONFIG);

    expect(result.metrics.markdownStructure?.autoFixedRules).toEqual(
      expect.arrayContaining(['MD009', 'MD010'])
    );
    expect(result.metrics.markdownStructure?.minorIssues).toBe(0);
  });

  it('should normalize malformed tables in heuristic path before markdown validation', () => {
    const content = `# Lesson

## Introduction

Workflow automation and deterministic table normalization are shown below.

| Stage | Action | Owner |
| :--- | :--- | :--- | :|
| Draft | Build |
| Review | Approve | QA |

## Conclusion

Workflow automation with deterministic table normalization improves reliability.
`;

    const result = runHeuristicFilters(content, createLessonSpec(), RELAXED_CONFIG);
    const markdownFailures = result.failures.filter(f => f.filter === 'markdownStructure');

    expect(result.metrics.markdownStructure?.criticalIssues).toBe(0);
    expect(markdownFailures.every(f => f.severity !== 'critical')).toBe(true);
  });
});

describe('markdownlint table severity mapping', () => {
  it('should classify table rules with structural severity', () => {
    expect(getRuleSeverity('MD055')).toBe('major');
    expect(getRuleSeverity('MD056')).toBe('critical');
    expect(getRuleSeverity('MD060')).toBe('major');
  });
});
