/**
 * Contract: a LangChain call records what OpenRouter charged, at insert
 * (mc2-tcs2e).
 *
 * The whole chain, driven end to end against a real `ChatOpenAI` and a transport
 * that answers the way OpenRouter does: the guard reads `usage.cost` out of the
 * body, `costRecordingCallbacks` collects it by generation id, and the trace row
 * is written with the charge and marked `billedByProvider` immediately — rather
 * than with a catalogue estimate and a promise to look it up later.
 *
 * Over the fortnight to 2026-08-25 that promise went unkept for 92 of 509 rows,
 * because the deferred lookup needs a generation id and those rows had captured
 * one exactly once. On `stage_6_content` — the most expensive line of a course —
 * 13 rows of 13 were unsettled.
 *
 * The catalogue estimate is not deleted by any of this. It stays in `input_data`
 * as `estimatedCostUsd`, so a wrong catalogue entry is still visible next to the
 * truth it failed to match.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const logTraceMock = vi.hoisted(() => vi.fn(() => Promise.resolve('trace-row-1')));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: logTraceMock }));
vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/shared/llm/openrouter-generation', () => ({
  // The deferred receipt is a different mechanism and a different task. Stubbed
  // to nothing so this test observes only what the insert itself wrote.
  fetchGenerationFact: vi.fn(() => Promise.resolve(null)),
}));

import { createCostRecordingModel } from '@/shared/llm/langchain-models';
import { pendingStatedChargeCount, resetStatedCharges } from '@/shared/llm/stated-charge-capture';

const GENERATION_ID = 'gen-1787317000-statedCharge';
const COURSE_ID = '10000000-0000-4000-8000-000000000002';
/** The figure the live API returned on 13+5 tokens on 2026-08-25. */
const STATED_CHARGE = 0.000004257;

/** OpenRouter's answer, with the charge where OpenRouter puts it. */
function answer(cost: number | undefined): Response {
  return new Response(
    JSON.stringify({
      id: GENERATION_ID,
      object: 'chat.completion',
      created: 1787317000,
      model: 'openai/gpt-5.6-luna',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '{"answer":"ok"}' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 13,
        completion_tokens: 5,
        total_tokens: 18,
        ...(cost === undefined ? {} : { cost }),
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-generation-id': GENERATION_ID },
    }
  );
}

function serving(cost: number | undefined): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(answer(cost)))
  );
}

function model() {
  return createCostRecordingModel('openai/gpt-5.6-luna', 0, 256, 'stage_6_content', COURSE_ID);
}

/** The single row the call wrote. */
function tracedRow(): Record<string, unknown> {
  expect(logTraceMock).toHaveBeenCalledTimes(1);
  return logTraceMock.mock.calls[0][0] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStatedCharges();
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a LangChain call the provider priced', () => {
  it('records the stated charge instead of a catalogue estimate', async () => {
    serving(STATED_CHARGE);

    await model().invoke('anything');

    expect(tracedRow()).toMatchObject({
      phase: 'stage_6_content',
      costUsd: STATED_CHARGE,
      modelUsed: 'openai/gpt-5.6-luna',
    });
  });

  it('marks the row settled at insert, so no reconciliation reads it as a guess', async () => {
    serving(STATED_CHARGE);

    await model().invoke('anything');

    expect(tracedRow().outputData).toMatchObject({
      billedByProvider: true,
      generationId: GENERATION_ID,
    });
    expect(tracedRow().inputData).toMatchObject({ billedInResponse: true });
  });

  it('keeps the catalogue estimate alongside it rather than overwriting it', async () => {
    serving(STATED_CHARGE);

    await model().invoke('anything');

    // A wrong catalogue entry has to stay visible after the row is settled;
    // three of them were wrong at once on 2026-08-20.
    const input = tracedRow().inputData as { estimatedCostUsd?: number };
    expect(typeof input.estimatedCostUsd).toBe('number');
    expect(input.estimatedCostUsd).not.toBe(STATED_CHARGE);
  });

  it('settles a structured call too — the path that once recorded nothing', async () => {
    serving(STATED_CHARGE);

    const structured = model().withStructuredOutput(z.object({ answer: z.string() }));
    await structured.invoke('anything');

    expect(tracedRow()).toMatchObject({ costUsd: STATED_CHARGE });
    expect(tracedRow().outputData).toMatchObject({ billedByProvider: true });
  });

  it('records a stated $0 as the measurement it is', async () => {
    serving(0);

    await model().invoke('anything');

    expect(tracedRow().costUsd).toBe(0);
    expect(tracedRow().outputData).toMatchObject({ billedByProvider: true });
  });

  it('leaves nothing behind in the map once the row is written', async () => {
    serving(STATED_CHARGE);

    await model().invoke('anything');

    expect(pendingStatedChargeCount()).toBe(0);
  });
});

describe('a call that stated no charge', () => {
  it('keeps today’s behaviour: an estimate and no settled marker', async () => {
    serving(undefined);

    await model().invoke('anything');

    const row = tracedRow();
    expect(row.outputData).toBeUndefined();
    // Still priced and still traced — a miss must not cost the row its estimate.
    expect(typeof row.costUsd).toBe('number');
    expect(row.costUsd).not.toBe(0);
    expect(row.inputData).toMatchObject({ generationId: GENERATION_ID });
  });
});
