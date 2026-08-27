/**
 * Contract: a completion made with a course context records what it cost.
 *
 * Every LLM call used to leave tokens in the trace and no price, because the
 * cost path had no production caller (mc2-o7740). What it is priced *from*
 * matters as much: the catalogue holds the mainstream providers' rate while the
 * per-attempt pin routes to the cheapest, so when an endpoint is pinned its own
 * live rate is the one that will be billed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const statedCost = vi.hoisted(() => ({ value: undefined as number | undefined }));
const listModelEndpoints = vi.fn(() => Promise.resolve([] as unknown[]));
vi.mock('@/shared/llm/openrouter-endpoints', async importOriginal => {
  const original = await importOriginal<typeof import('@/shared/llm/openrouter-endpoints')>();
  return { ...original, listModelEndpoints };
});

vi.mock('@/shared/services/api-key-service', () => ({
  getOpenRouterApiKey: vi.fn(() => Promise.resolve('test-key')),
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
        create: vi.fn().mockImplementation(() => ({
          choices: [{ message: { content: 'ответ' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 200_000,
            completion_tokens: 100_000,
            total_tokens: 300_000,
            // Every real completion carries this. Left off by default so the
            // estimate paths above stay exercised.
            ...(statedCost.value === undefined ? {} : { cost: statedCost.value }),
          },
          // The provider reports what it actually served, which is what the
          // price must follow once a fallback fires.
          model: 'z-ai/glm-5.2',
        })),
      },
    };
  });
  (MockOpenAI as unknown as { APIError: unknown }).APIError = MockAPIError;
  return { default: MockOpenAI };
});

const logTrace = vi.fn(() => Promise.resolve(undefined));
vi.mock('@/shared/trace-logger', () => ({ logTrace }));

const COURSE_ID = '20000000-0000-4000-8000-000000000001';

describe('LLMClient cost recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statedCost.value = undefined;
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
    // glm-5.2 is $1.19 in and $3.74 out per million: 0.238 + 0.374.
    // Re-read from /api/v1/models on 2026-08-25. It has moved twice now — 1.23x
    // too dear in the other direction on 2026-08-21 (mc2-156kg), then 0.81x too
    // cheap by today. A published rate is a moving number, which is what
    // scripts/check-model-catalog-drift.ts exists to notice.
    expect(entry.costUsd).toBeCloseTo(0.612, 10);
  });

  it('prices a pinned attempt from the endpoint that will serve it', async () => {
    // glm-5.2 is catalogued at 1.19/3.74 and its cheapest live endpoint is
    // sail-research/fp8 at 0.50/3.15. 200k in + 100k out is $0.612 by the
    // catalogue and $0.415 by the endpoint — and the endpoint is the one that
    // sends the invoice.
    listModelEndpoints.mockResolvedValueOnce([
      {
        tag: 'sail-research/fp8',
        providerName: 'Sail Research',
        promptPricePerMillion: 0.5,
        completionPricePerMillion: 3.15,
        status: 0,
        tier: 'default',
      },
    ]);

    const { LLMClient } = await import('@/shared/llm/client');
    await new LLMClient().generateCompletion('\u0432\u043e\u043f\u0440\u043e\u0441', {
      model: 'z-ai/glm-5.2',
      costContext: { courseId: COURSE_ID, stage: 'stage_6', phase: 'stage_6_judge' },
    });

    const [entry] = logTrace.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(entry.costUsd).toBeCloseTo(0.415, 10);
  });

  it('records the charge OpenRouter stated in the body, over any estimate', async () => {
    // The catalogue would say $0.612 and the pinned endpoint $0.415. The
    // provider says $0.37, and the provider is the one sending the invoice.
    listModelEndpoints.mockResolvedValueOnce([
      {
        tag: 'sail-research/fp8',
        providerName: 'Sail Research',
        promptPricePerMillion: 0.5,
        completionPricePerMillion: 3.15,
        status: 0,
        tier: 'default',
      },
    ]);
    statedCost.value = 0.37;

    const { LLMClient } = await import('@/shared/llm/client');
    await new LLMClient().generateCompletion('вопрос', {
      model: 'z-ai/glm-5.2',
      costContext: { courseId: COURSE_ID, stage: 'stage_6', phase: 'stage_6_judge' },
    });

    const [entry] = logTrace.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(entry.costUsd).toBe(0.37);
    // Settled the moment it is written: no deferred lookup, and no reconciliation
    // reading it as an unpriced guess.
    expect(entry.outputData).toMatchObject({ billedByProvider: true });
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
