/**
 * Contract: a completion made with a course context records what it cost.
 *
 * Every LLM call used to leave tokens in the trace and no price, because the
 * cost path had no production caller. This asserts the call itself now prices
 * the served model from MODEL_CATALOG (mc2-o7740).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/shared/services/api-key-service', () => ({
  getOpenRouterApiKey: vi.fn(async () => 'test-key'),
  getApiKeySync: vi.fn(() => 'test-key'),
}));

vi.mock('openai', () => {
  class MockAPIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }
  const MockOpenAI = vi.fn(function (this: Record<string, unknown>) {
    this.chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'ответ' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 200_000, completion_tokens: 100_000, total_tokens: 300_000 },
          // The provider reports what it actually served, which is what the
          // price must follow once a fallback fires.
          model: 'z-ai/glm-5.2',
        }),
      },
    };
  });
  (MockOpenAI as unknown as { APIError: unknown }).APIError = MockAPIError;
  return { default: MockOpenAI };
});

const logTrace = vi.fn(async () => undefined);
vi.mock('@/shared/trace-logger', () => ({ logTrace }));

const COURSE_ID = '20000000-0000-4000-8000-000000000001';

describe('LLMClient cost recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('traces the served model, both token counts and the catalogue price', async () => {
    const { LLMClient } = await import('@/shared/llm/client');
    const client = new LLMClient();

    await client.generateCompletion('Расскажи про фотосинтез', {
      model: 'openai/gpt-5.6-luna',
      costContext: { courseId: COURSE_ID, stage: 'stage_6', phase: 'stage_6_complex' },
    });

    expect(logTrace).toHaveBeenCalledTimes(1);
    const [entry] = logTrace.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_6',
      phase: 'stage_6_complex',
      modelUsed: 'z-ai/glm-5.2',
      tokensUsed: 300_000,
    });
    // glm-5.2 is $0.63 in and $1.98 out per million: 0.126 + 0.198.
    expect(entry.costUsd).toBeCloseTo(0.324, 10);
  });

  it('makes no trace row for a call with no course to charge', async () => {
    const { LLMClient } = await import('@/shared/llm/client');
    const client = new LLMClient();

    await client.generateCompletion('Расскажи про фотосинтез', {
      model: 'openai/gpt-5.6-luna',
    });

    expect(logTrace).not.toHaveBeenCalled();
  });
});
