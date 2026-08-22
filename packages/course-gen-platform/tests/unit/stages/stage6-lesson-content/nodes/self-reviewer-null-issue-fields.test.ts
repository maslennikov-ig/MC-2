/**
 * A `null` where the model had nothing to say must not cost the whole review.
 *
 * Live run of 2026-08-22 (course 9a22e60d): two of three lessons answered with
 * `"inlineReplacement": null` on one issue. `quotedText`/`inlineReplacement`
 * were `.optional()`, which accepts an absent key and refuses `null`, and the
 * "using defaults" branch re-parsed with the same schema and threw. The outer
 * catch then reported `LLM review failed after retries` and the lesson fell
 * back to heuristics only — losing the model's valid issues as well.
 */
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
  createModelConfigService: () => ({ getModelForPhase: mockGetModelForPhase }),
}));

vi.mock('@/shared/llm', () => ({
  LLMClient: class {
    generateCompletion = mockGenerateCompletion;
  },
}));

import { runLLMReview } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm';
import { LLMIssueSchema } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-constants';

function buildLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: '1.1',
    title: 'Test lesson',
    difficulty_level: 'beginner',
    estimated_duration_minutes: 10,
    sections: [],
    learning_objectives: [{ id: 'lo-1', objective: 'Understand', bloom_level: 'understand' }],
    metadata: { target_audience: 'test', content_archetype: 'conceptual' },
  } as LessonSpecificationV2;
}

describe('self-reviewer tolerates nulls the model writes for "nothing here"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'deepseek/deepseek-v4-flash-0731',
      fallbackModelId: 'google/gemini-3.7-flash',
    });
  });

  it('reads a null quotedText and inlineReplacement as absent', () => {
    const parsed = LLMIssueSchema.parse({
      type: 'HYGIENE',
      severity: 'INFO',
      location: 'sec_1',
      description: 'Пример не соответствует сценарию',
      quotedText: null,
      inlineReplacement: null,
    });

    expect(parsed.quotedText).toBeUndefined();
    expect(parsed.inlineReplacement).toBeUndefined();
    expect(parsed.type).toBe('HYGIENE');
  });

  it('keeps the review — and the valid issues — when one issue carries a null', async () => {
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS_WITH_FLAGS',
        reasoning: 'Minor issues only',
        issues: [
          {
            type: 'HYGIENE',
            severity: 'INFO',
            location: 'sec_uprazhneniya',
            description: 'Пример ответа не соответствует сценарию',
            quotedText: 'Обязательные расходы составляют 65 000 рублей',
            inlineReplacement: null,
          },
          {
            type: 'GRAMMAR',
            severity: 'FIXABLE',
            location: 'sec_2',
            description: 'Опечатка',
            quotedText: 'бюджeт',
            inlineReplacement: 'бюджет',
          },
        ],
      }),
      totalTokens: 5931,
      finishReason: 'stop',
      model: 'unused-by-code',
    });

    const result = await runLLMReview({
      lessonSpec: buildLessonSpec(),
      ragChunks: [],
      generatedContent: '## Введение\nСодержание',
      language: 'ru',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.parsed?.issues).toHaveLength(2);
    expect(result.parsed?.issues[0].inlineReplacement).toBeUndefined();
    expect(result.parsed?.issues[1].inlineReplacement).toBe('бюджет');
  });

  it('drops an unusable issue instead of throwing away the review', async () => {
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS_WITH_FLAGS',
        reasoning: 'One issue is malformed',
        issues: [
          // `location` and `description` have defaults, so the only way to make
          // an issue genuinely unusable is a non-object.
          'not an issue object',
          {
            type: 'LOGIC',
            severity: 'COMPLEX',
            location: 'sec_3',
            description: 'Противоречие в примере',
          },
        ],
      }),
      totalTokens: 400,
      finishReason: 'stop',
      model: 'unused-by-code',
    });

    const result = await runLLMReview({
      lessonSpec: buildLessonSpec(),
      ragChunks: [],
      generatedContent: '## Введение\nСодержание',
      language: 'ru',
    });

    expect(result.success).toBe(true);
    expect(result.parsed?.issues).toHaveLength(1);
    expect(result.parsed?.issues[0].location).toBe('sec_3');
  });
});
