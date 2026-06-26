import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';

vi.mock('@/shared/logger', () => {
  const mockLogger = {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };
  return {
    logger: mockLogger,
    default: mockLogger,
  };
});

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

const { mockGenerateCompletion, MockLLMClient } = vi.hoisted(() => {
  const mockFn = vi.fn();
  return {
    mockGenerateCompletion: mockFn,
    MockLLMClient: class {
      generateCompletion = mockFn;
    },
  };
});

const { mockSaveRejectedContent } = vi.hoisted(() => ({
  mockSaveRejectedContent: vi.fn().mockResolvedValue(undefined),
}));

mockGenerateCompletion.mockResolvedValue({
  content: JSON.stringify({
    status: 'PASS',
    reasoning: 'Content passed semantic review',
    issues: [],
    patched_content: null,
  }),
  inputTokens: 200,
  outputTokens: 300,
  totalTokens: 500,
  model: 'anthropic/claude-3-haiku',
  finishReason: 'stop',
});

vi.mock('@/shared/llm', () => ({
  LLMClient: MockLLMClient,
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn().mockReturnValue({
    getModelForPhase: vi.fn().mockResolvedValue({
      modelId: 'anthropic/claude-3-haiku',
      fallbackModelId: 'anthropic/claude-3-haiku',
      temperature: 0.7,
      maxTokens: 4096,
      maxContextTokens: 200000,
      qualityThreshold: null,
      maxRetries: 3,
      timeoutMs: null,
      tier: 'standard',
      source: 'database',
    }),
  }),
}));

vi.mock('@/stages/stage6-lesson-content/services/database-service', () => ({
  saveRejectedContent: mockSaveRejectedContent,
  saveLessonContent: vi.fn().mockResolvedValue(undefined),
  updateCourseProgress: vi.fn().mockResolvedValue(undefined),
}));

import { selfReviewerNode } from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';

function createMockLessonSpec(
  overrides: Partial<LessonSpecificationV2> = {}
): LessonSpecificationV2 {
  return {
    lesson_id: '1.2',
    title: 'Test Lesson',
    learning_objectives: [{ id: 'obj_1', objective: 'Understand the basics', level: 'Remember' }],
    sections: [
      { id: 'sec_1', title: 'Практика', type: 'lecture', required: true, constraints: {} },
    ],
    metadata: {
      lesson_duration_minutes: 15,
      difficulty_level: 'intermediate',
      prerequisites: [],
      key_concepts: ['test'],
      content_archetype: 'conceptual',
      tone: 'professional',
    },
    rag_context: { required: false, priority: 0 },
    ...overrides,
  } as LessonSpecificationV2;
}

function createMockState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: createMockLessonSpec(),
    courseId: 'course-123',
    language: 'ru',
    lessonUuid: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    generatedContent: '',
    sectionProgress: 0,
    selfReviewResult: null,
    lessonContent: null,
    currentNode: 'generator',
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
    selectedModelPhase: null,
    selectedModelSource: null,
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

describe('selfReviewer canonical markdown source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS',
        reasoning: 'Content passed semantic review',
        issues: [],
        patched_content: null,
      }),
      inputTokens: 200,
      outputTokens: 300,
      totalTokens: 500,
      model: 'anthropic/claude-3-haiku',
      finishReason: 'stop',
    });
  });

  it('evaluates canonical markdown instead of raw structured payload tail', async () => {
    const state = createMockState({
      generatedContent: JSON.stringify({
        intro:
          'Краткое введение с нормальной длиной текста, чтобы эвристика не сочла контент подозрительно коротким.',
        sections: [
          {
            title: 'Практика',
            content:
              'Тактические задачи: 2, 4. Дополнительно студент должен сравнить стратегические и тактические цели, описать различия между ними и привести собственный рабочий пример.',
          },
        ],
        examples: [],
        exercises: [],
      }),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails?.truncationCheck.passed).toBe(true);
    expect(result.generatedContent).toBeTypeOf('string');
    expect(result.generatedContent).not.toBe(state.generatedContent);
    expect(result.generatedContent).toContain('## Практика');
    expect(result.generatedContent).toContain('Тактические задачи: 2, 4.');
  });

  it('preserves raw generator output when saving rejected content after canonical review', async () => {
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'REGENERATE',
        reasoning: 'Need another pass',
        issues: [
          {
            type: 'HYGIENE',
            severity: 'major',
            location: 'section 1',
            description: 'Need regeneration',
          },
        ],
        patched_content: null,
      }),
      inputTokens: 200,
      outputTokens: 300,
      totalTokens: 500,
      model: 'anthropic/claude-3-haiku',
      finishReason: 'stop',
    });

    const rawStructuredContent: LessonContentBody = {
      intro:
        'Краткое введение с нормальной длиной текста, чтобы эвристика не сочла контент подозрительно коротким.',
      sections: [
        {
          title: 'Практика',
          content:
            'Тактические задачи: 2, 4. Дополнительно студент должен сравнить стратегические и тактические цели, описать различия между ними и привести собственный рабочий пример.',
        },
      ],
      examples: [],
      exercises: [],
    };
    const rawStructuredPayload = JSON.stringify(rawStructuredContent);

    const state = createMockState({
      generatedContent: rawStructuredPayload,
      lessonContent: {
        content: rawStructuredContent,
      } as LessonGraphStateType['lessonContent'],
    });

    await selfReviewerNode(state);

    expect(mockSaveRejectedContent).toHaveBeenCalledTimes(1);
    expect(mockSaveRejectedContent).toHaveBeenCalledWith(
      'course-123',
      '1.2',
      null,
      rawStructuredPayload,
      expect.objectContaining({ status: 'REGENERATE' }),
      1,
      expect.objectContaining({
        reviewContent: expect.stringContaining('## Практика'),
        reviewContentSource: 'canonical',
        canonicalizationFailureReason: null,
      })
    );
  });
});
