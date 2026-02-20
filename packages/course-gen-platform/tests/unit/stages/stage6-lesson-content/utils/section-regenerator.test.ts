import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

const { mockGenerateSection, mockChildWarn } = vi.hoisted(() => ({
  mockGenerateSection: vi.fn(),
  mockChildWarn: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const childLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: mockChildWarn,
    error: vi.fn(),
  };

  return {
    logger: {
      child: () => childLogger,
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/stages/stage6-lesson-content/nodes/generator', () => ({
  generateSection: mockGenerateSection,
}));

import { regenerateSections } from '@/stages/stage6-lesson-content/utils/section-regenerator';

function createLessonSpec(overrides: Partial<LessonSpecificationV2> = {}): LessonSpecificationV2 {
  return {
    lesson_id: 'lesson-1',
    title: 'Test Lesson',
    description: 'Test description',
    difficulty_level: 'beginner',
    learning_objectives: [
      {
        id: 'lo-1',
        objective: 'Understand the key lesson objective',
        bloom_level: 'understand',
      },
    ],
    metadata: {
      target_audience: 'novice',
      tone: 'formal',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Why this matters',
      key_learning_objectives: 'Understand the key lesson objective',
    },
    sections: [
      {
        title: 'Core Concepts',
        content_archetype: 'concept_explainer',
        rag_context_id: 'sec-1',
        constraints: {
          depth: 'summary',
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: ['Core concept 1'],
      },
    ],
    exercises: [
      {
        type: 'conceptual',
        difficulty: 'easy',
        learning_objective_id: 'lo-1',
        structure_template: 'Given a scenario, explain the key concept and tradeoff decisions.',
        rubric_criteria: [
          {
            criteria: ['Accurate explanation'],
            weight: 100,
          },
        ],
        suggested_topic: 'Core concept practice',
        time_estimate_min: 10,
      },
    ],
    rag_context: {
      primary_documents: [],
      retrieval_hints: [],
    },
    ...overrides,
  } as LessonSpecificationV2;
}

describe('regenerateSections - introduction handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces pre-H2 preface when regenerating introduction', async () => {
    const markdown = `# Lesson Title

Legacy intro without explicit intro header.

## Core Concepts

Body section content.`;

    mockGenerateSection.mockResolvedValueOnce({
      content: 'Regenerated intro content.',
      tokensUsed: 42,
      modelUsed: 'test-model',
    });

    const result = await regenerateSections({
      markdown,
      sectionIds: ['introduction'],
      lessonSpec: createLessonSpec(),
      ragChunks: [],
      language: 'en',
    });

    expect(result.success).toBe(true);
    expect(result.regeneratedSections).toEqual(['introduction']);
    expect(result.failedSections).toEqual([]);
    expect(result.content).toContain('## Introduction');
    expect(result.content).toContain('Regenerated intro content.');
    expect(result.content).not.toContain('Legacy intro without explicit intro header.');
  });

  it('marks section as failed when regeneration produces no content change', async () => {
    const markdown = `# Lesson Title

## Introduction

Keep this introduction unchanged.

## Core Concepts

Body section content.`;

    mockGenerateSection.mockResolvedValueOnce({
      content: 'Keep this introduction unchanged.',
      tokensUsed: 11,
      modelUsed: 'test-model',
    });

    const result = await regenerateSections({
      markdown,
      sectionIds: ['introduction'],
      lessonSpec: createLessonSpec(),
      ragChunks: [],
      language: 'en',
    });

    expect(result.success).toBe(false);
    expect(result.regeneratedSections).toEqual([]);
    expect(result.failedSections).toEqual(['introduction']);
    expect((result as { noOpSections?: string[] }).noOpSections).toEqual(['introduction']);
    expect(result.content).toBe(markdown);
    expect(mockChildWarn).toHaveBeenCalled();
  });
});
