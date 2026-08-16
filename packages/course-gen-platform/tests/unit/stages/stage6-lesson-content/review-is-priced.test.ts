/**
 * Contract: reviewing a lesson is paid work, and it is charged once.
 *
 * Reviewing a lesson costs more than writing it, and the trace said otherwise.
 * Self-review left no row at all — not even its tokens. The judge's own row
 * carried a price, but an invented one: the whole cascade's tokens split evenly
 * across the judges, an assumed 80/20 input/output ratio when the split was
 * missing, and the tokens of targeted refinement charged at judge rates though a
 * cheaper model did that work.
 *
 * So each call now prices itself, and the summary row stops estimating. Both
 * halves matter: pricing the calls while the summary still estimates would count
 * the same tokens twice and make the course look more expensive than the invoice
 * (mc2-b7olk.1).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logTraceMock, generateCompletionMock } = vi.hoisted(() => ({
  logTraceMock: vi.fn(),
  generateCompletionMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: logTraceMock }));
vi.mock('@/shared/llm', () => ({
  LLMClient: class {
    generateCompletion = generateCompletionMock;
  },
}));
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({
    getModelForPhase: async () => ({ modelId: 'deepseek/deepseek-v4-flash', source: 'test' }),
  }),
  REASONING_DISABLED: { enabled: false },
}));

import { runLLMReview } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm';
import { finalizeJudgeResult } from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';

const COURSE_ID = '944e6795-580c-45b7-8eee-75a67c123965';
const LESSON_UUID = '0f2f6b3f-6f9a-4a52-9a24-2b1a4a9b8f10';

beforeEach(() => {
  vi.clearAllMocks();
  generateCompletionMock.mockResolvedValue({
    content: JSON.stringify({ status: 'PASS', reasoning: 'fine', issues: [] }),
    model: 'deepseek/deepseek-v4-flash',
    totalTokens: 12_000,
    inputTokens: 11_000,
    outputTokens: 1_000,
  });
});

function lessonSpec() {
  return {
    lesson_id: '2.1',
    title: 'Time management basics',
    sections: [{ title: 'Body' }],
    learning_objectives: [],
    metadata: { target_audience: 'beginner', tone: 'neutral', content_archetype: 'concept' },
  } as never;
}

describe('Stage 6 review pays for itself', () => {
  it('charges self-review to the course that asked for it', async () => {
    await runLLMReview({
      lessonSpec: lessonSpec(),
      ragChunks: [],
      generatedContent: '## Body\n\nSome content.',
      language: 'en',
      courseId: COURSE_ID,
    });

    const options = generateCompletionMock.mock.calls[0][1];
    expect(options.costContext).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_6',
      phase: 'stage_6_refinement',
    });
  });

  it('says nothing rather than charging a course it does not know', async () => {
    await runLLMReview({
      lessonSpec: lessonSpec(),
      ragChunks: [],
      generatedContent: '## Body\n\nSome content.',
      language: 'en',
    });

    expect(generateCompletionMock.mock.calls[0][1].costContext).toBeUndefined();
  });

  it('leaves the judge summary row unpriced, so nothing is counted twice', async () => {
    await finalizeJudgeResult({
      state: {
        courseId: COURSE_ID,
        lessonUuid: LESSON_UUID,
        lessonSpec: lessonSpec(),
        language: 'en',
        scoreHistory: [],
      },
      contentBody: { sections: [] },
      startTime: Date.now(),
      cascadeResult: {
        stage: 'clev',
        passed: true,
        finalScore: 0.9,
        totalTokensUsed: 16_601,
        totalInputTokens: 13_000,
        totalOutputTokens: 3_601,
        clevResult: { verdicts: [{ judgeModel: 'z-ai/glm-5.2' }] },
      },
      finalScore: 0.9,
      finalRecommendation: 'ACCEPT',
      needsRegeneration: false,
      needsHumanReview: false,
      refinementTokensUsed: 0,
    } as never);

    const row = logTraceMock.mock.calls
      .map(call => call[0])
      .find(arg => arg.stepName === 'judge_complete');
    expect(row).toBeDefined();
    expect(row.tokensUsed).toBe(16_601);
    expect(row.costUsd).toBeUndefined();
  });
});
