import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

const {
  mockRegenerateSections,
  mockLogTrace,
  mockRunMermaidFixPipeline,
  mockValidateGeneratedContent,
  mockWarn,
} = vi.hoisted(() => ({
  mockRegenerateSections: vi.fn(),
  mockLogTrace: vi.fn(),
  mockRunMermaidFixPipeline: vi.fn(),
  mockValidateGeneratedContent: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  },
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: mockLogTrace,
}));

vi.mock('@/stages/stage6-lesson-content/utils/section-regenerator', () => ({
  regenerateSections: mockRegenerateSections,
}));

vi.mock('@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline', () => ({
  runMermaidFixPipeline: mockRunMermaidFixPipeline,
}));

vi.mock('@/stages/stage6-lesson-content/nodes/generator/generator-content', () => ({
  validateGeneratedContent: mockValidateGeneratedContent,
}));

import { sectionRegeneratorNode } from '@/stages/stage6-lesson-content/nodes/section-regenerator';

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

function createState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: createLessonSpec(),
    courseId: 'course-1',
    language: 'en',
    lessonUuid: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    style: null,
    generatedContent: '# Lesson Title\n\n## Core Concepts\n\nBody section content.',
    sectionProgress: 0,
    selfReviewResult: {
      status: 'PASS_WITH_FLAGS',
      heuristicsPassed: true,
      issues: [],
      reasoning: '',
      sectionsToRegenerate: ['introduction'],
      durationMs: 0,
      tokensUsed: 0,
      heuristicDetails: {
        languageCheck: { passed: true, foreignCharacters: 0, scriptsFound: [] },
        truncationCheck: { passed: true, issues: [] },
      },
    },
    sectionRegenerationResult: null,
    progressSummary: null,
    lessonContent: null,
    currentNode: 'selfReviewer',
    errors: [],
    retryCount: 0,
    regenerationMode: null,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    lastGenerationTokens: 0,
    modelUsed: null,
    selectedModel: null,
    fallbackModel: null,
    selectedModelTier: null,
    selectedModelTierReason: null,
    tokensUsed: 0,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    reviewInfo: null,
    previousScores: [],
    refinementIterationCount: 0,
    targetedRefinementMode: 'full-auto',
    arbiterOutput: null,
    targetedRefinementStatus: null,
    lockedSections: [],
    sectionEditCount: {},
    targetedRefinementTokensUsed: 0,
    ...overrides,
  } as LessonGraphStateType;
}

describe('sectionRegeneratorNode - no-op telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunMermaidFixPipeline.mockImplementation((content: string) =>
      Promise.resolve({
        content,
        modified: false,
        metrics: {
          diagramsTotal: 0,
          diagramsAutoWrapped: 0,
          diagramsFixedRegex: 0,
          diagramsFixedLLM: 0,
          diagramsFallback: 0,
          durationMs: 0,
        },
      })
    );
    mockValidateGeneratedContent.mockReturnValue({
      isValid: true,
      detectedMarkers: [],
    });
    mockLogTrace.mockResolvedValue(undefined);
  });

  it('logs trace signal when section regeneration includes no-op failures', async () => {
    const markdown = '# Lesson Title\n\n## Core Concepts\n\nBody section content.';
    mockRegenerateSections.mockResolvedValueOnce({
      success: false,
      content: markdown,
      tokensUsed: 15,
      durationMs: 123,
      regeneratedSections: [],
      failedSections: ['introduction'],
      noOpSections: ['introduction'],
      modelsUsed: ['test-model'],
      errorMessage: 'Failed to regenerate sections: introduction',
    });

    const result = await sectionRegeneratorNode(createState({ generatedContent: markdown }));

    expect(result.currentNode).toBe('sectionRegenerator');
    expect(result.generatedContent).toBe(markdown);

    expect(mockLogTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'section_regenerator',
        stepName: 'section_regen_complete',
        outputData: expect.objectContaining({
          failedSections: ['introduction'],
          noOpSections: ['introduction'],
        }),
      })
    );

    expect(mockLogTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'section_regenerator',
        stepName: 'section_regen_noop',
        outputData: expect.objectContaining({
          noOpSections: ['introduction'],
        }),
      })
    );

    expect(mockWarn).toHaveBeenCalled();
  });
});
