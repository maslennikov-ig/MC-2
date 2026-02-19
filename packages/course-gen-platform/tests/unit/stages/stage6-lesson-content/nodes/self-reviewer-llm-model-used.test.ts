import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

const { mockGetModelForPhase, mockGenerateCompletion } = vi.hoisted(() => ({
  mockGetModelForPhase: vi.fn(),
  mockGenerateCompletion: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({
    getModelForPhase: mockGetModelForPhase,
  }),
}));

vi.mock('@/shared/llm', () => ({
  LLMClient: class {
    generateCompletion = mockGenerateCompletion;
  },
}));

import { runLLMReview } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm';

function buildLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: '2.1',
    title: 'Test lesson',
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 10,
    sections: [],
    learning_objectives: [
      {
        id: 'lo-1',
        objective: 'Understand key concepts',
        bloom_level: 'understand',
      },
    ],
    metadata: {
      target_audience: 'test',
      content_archetype: 'conceptual',
    },
  } as LessonSpecificationV2;
}

describe('runLLMReview modelUsed tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns selected model id on successful LLM review', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'moonshotai/kimi-k2-thinking',
      fallbackModelId: 'google/gemini-3-flash-preview',
    });

    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS',
        reasoning: 'Looks good',
        issues: [],
      }),
      totalTokens: 321,
      finishReason: 'stop',
      model: 'unused-by-code',
    });

    const result = await runLLMReview({
      lessonSpec: buildLessonSpec(),
      ragChunks: [],
      generatedContent: '## Intro\nContent',
      language: 'ru',
    });

    expect(result.success).toBe(true);
    expect(result.modelUsed).toBe('moonshotai/kimi-k2-thinking');
    expect(result.tokensUsed).toBe(321);
  });

  it('returns selected model id even when LLM response is invalid', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'qwen/qwen3.5-plus-02-15',
      fallbackModelId: 'moonshotai/kimi-k2-thinking',
    });

    mockGenerateCompletion.mockResolvedValue({
      content: 'not-json',
      totalTokens: 111,
      finishReason: 'stop',
      model: 'unused-by-code',
    });

    const result = await runLLMReview({
      lessonSpec: buildLessonSpec(),
      ragChunks: [],
      generatedContent: '## Intro\nContent',
      language: 'ru',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid response format');
    expect(result.modelUsed).toBe('qwen/qwen3.5-plus-02-15');
    expect(result.tokensUsed).toBe(111);
  });
});
