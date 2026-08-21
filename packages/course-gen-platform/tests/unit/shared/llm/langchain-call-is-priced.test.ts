/**
 * Contract: a LangChain call records its price and carries the provider's
 * receipt — including the structured calls.
 *
 * The paid run of 2026-08-21 got a provider figure for one call in fifteen. The
 * other fourteen went through LangChain, whose transport was instrumented while
 * nothing opened the slot it deposits into, so the id was dropped in silence.
 * Meanwhile anything reached through `withStructuredOutput` recorded no cost at
 * all, because the callbacks were assigned to a model that LangChain then cloned
 * away (mc2-258fi).
 *
 * Both are one fact now: the callbacks go in the constructor, where the clone
 * keeps them, and the generation id is read off the message instead of a header.
 * This drives a real `ChatOpenAI` against a transport that answers the way
 * OpenRouter does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const recorded = vi.hoisted(
  () => [] as Array<{ usage: Record<string, unknown>; context: Record<string, unknown> }>
);

vi.mock('@/shared/metrics/llm-cost', () => ({
  recordLlmCallCost: vi.fn(async (usage, context) => {
    recorded.push({ usage, context });
  }),
  calculateLlmCostUsd: () => 0.0001,
  settleTraceCostFromProvider: vi.fn(),
}));

import { createCostRecordingModel } from '@/shared/llm/langchain-models';

const GENERATION_ID = 'gen-1787317000-cLmXqTestReceipt';
const COURSE_ID = '10000000-0000-4000-8000-000000000001';

/** What OpenRouter sends back: the id is in the body, and in the header. */
function answer(): Response {
  return new Response(
    JSON.stringify({
      id: GENERATION_ID,
      object: 'chat.completion',
      created: 1787317000,
      model: 'openai/gpt-oss-20b',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '{"answer":"ok"}' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 41, completion_tokens: 7, total_tokens: 48 },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-generation-id': GENERATION_ID },
    }
  );
}

beforeEach(() => {
  recorded.length = 0;
  process.env.OPENROUTER_API_KEY = 'test-key';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => answer())
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function model() {
  return createCostRecordingModel(
    'openai/gpt-oss-20b',
    0,
    256,
    'stage_3_classification',
    COURSE_ID
  );
}

describe('a LangChain call prices itself and keeps the receipt', () => {
  it('records a direct invoke with the provider generation id', async () => {
    await model().invoke('anything');

    expect(recorded).toHaveLength(1);
    expect(recorded[0].usage).toMatchObject({
      model: 'openai/gpt-oss-20b',
      inputTokens: 41,
      outputTokens: 7,
      generationId: GENERATION_ID,
    });
    expect(recorded[0].context).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_3',
      phase: 'stage_3_classification',
    });
  });

  it('records a structured call too — the one that used to record nothing', async () => {
    const structured = model().withStructuredOutput(z.object({ answer: z.string() }));
    const parsed = await structured.invoke('anything');

    expect(parsed).toEqual({ answer: 'ok' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].usage).toMatchObject({
      inputTokens: 41,
      outputTokens: 7,
      generationId: GENERATION_ID,
    });
  });

  it('records nothing without a course, which is the documented shape', async () => {
    const anonymous = createCostRecordingModel(
      'openai/gpt-oss-20b',
      0,
      256,
      'stage_3_classification'
    );

    await anonymous.invoke('anything');

    expect(recorded).toEqual([]);
  });
});
