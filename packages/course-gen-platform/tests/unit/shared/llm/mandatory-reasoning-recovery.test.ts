/* eslint-disable @typescript-eslint/require-await -- stub models mirror the async interface */
/**
 * Contract: a model that turns out to require reasoning costs one refused call,
 * not a live course.
 *
 * `MODEL_CATALOG.requiresReasoning` is a hand-kept fact about someone else's
 * service. It is right today because every catalogued model was measured
 * against the live API on 2026-08-15, and OpenRouter's `supported_parameters`
 * cannot tell the two kinds apart — so the next model added brings the defect
 * back, and last time it cost a paid run (mc2-2pplo).
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

import {
  forgetLearnedMandatoryReasoning,
  isMandatoryReasoningRejection,
  rememberMandatoryReasoning,
  requiresReasoningNow,
  withMandatoryReasoningRecoveryFetch,
} from '@/shared/llm/mandatory-reasoning-recovery';
import { applyMandatoryReasoningFloor } from '@/shared/llm/client-helpers';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const UNFLAGGED = 'some-vendor/some-new-thinker';

describe('mandatory reasoning recovery', () => {
  beforeEach(forgetLearnedMandatoryReasoning);

  it('recognises the refusal by what the provider actually says', () => {
    expect(
      isMandatoryReasoningRejection(
        new ApiError(400, 'Reasoning is mandatory for this endpoint and cannot be disabled')
      )
    ).toBe(true);
  });

  it('is not fooled by any other bad request', () => {
    expect(isMandatoryReasoningRejection(new ApiError(400, 'max_tokens is too large'))).toBe(false);
    expect(isMandatoryReasoningRejection(new ApiError(429, 'rate limited'))).toBe(false);
    expect(isMandatoryReasoningRejection(new Error('reasoning budget exceeded'))).toBe(false);
  });

  it('learns the model, so the next request asks for the least deliberation', () => {
    expect(requiresReasoningNow(UNFLAGGED)).toBe(false);

    expect(rememberMandatoryReasoning(UNFLAGGED)).toBe(true);

    expect(requiresReasoningNow(UNFLAGGED)).toBe(true);
  });

  it('says it is not news the second time, so a retry is not made forever', () => {
    rememberMandatoryReasoning(UNFLAGGED);

    expect(rememberMandatoryReasoning(UNFLAGGED)).toBe(false);
  });

  it('has nothing to learn about a model the catalogue already flags', () => {
    expect(requiresReasoningNow('google/gemini-3.7-flash')).toBe(true);
    expect(rememberMandatoryReasoning('google/gemini-3.7-flash')).toBe(false);
  });

  it('grows the answer budget when it asks for the floor, because it is billed', () => {
    const request = { model: UNFLAGGED, messages: [], max_tokens: 1_000 } as never;

    applyMandatoryReasoningFloor(request, UNFLAGGED);

    expect(request).toMatchObject({ reasoning: { effort: 'low' } });
    expect((request as { max_tokens: number }).max_tokens).toBeGreaterThan(1_000);
  });
});

/**
 * The recovery lives in the transport, not in `invoke`, because that is the only
 * layer `withStructuredOutput` cannot drop (mc2-148j9). These tests state that
 * as behaviour: what the wire carries on the retry, and that a structured call
 * gets one.
 */
describe('the transport wrapper', () => {
  beforeEach(forgetLearnedMandatoryReasoning);

  const REFUSAL = JSON.stringify({
    error: {
      code: 400,
      message: 'Reasoning is mandatory for this endpoint and cannot be disabled',
    },
  });

  const refused = () =>
    new Response(REFUSAL, { status: 400, headers: { 'content-type': 'application/json' } });

  const answered = () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: UNFLAGGED,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'answer' },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  /** A transport that refuses the first `refusals` requests and records bodies. */
  function fakeFetch(refusals: number) {
    const bodies: Record<string, unknown>[] = [];
    let seen = 0;
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      seen += 1;
      return seen <= refusals ? refused() : answered();
    });
    return { fetchImpl: fetchImpl as unknown as typeof globalThis.fetch, bodies, calls: fetchImpl };
  }

  function modelOn(fetchImpl: typeof globalThis.fetch): ChatOpenAI {
    return new ChatOpenAI({
      model: UNFLAGGED,
      apiKey: 'test-key',
      maxTokens: 1_000,
      maxRetries: 0,
      configuration: {
        baseURL: 'http://127.0.0.1:1/never-reached',
        fetch: withMandatoryReasoningRecoveryFetch(UNFLAGGED, fetchImpl),
      },
      modelKwargs: { reasoning: { enabled: false } },
    });
  }

  it('re-sends the refused request asking for the least deliberation', async () => {
    const { fetchImpl, bodies, calls } = fakeFetch(1);

    await modelOn(fetchImpl).invoke('hello');

    expect(calls).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toMatchObject({ reasoning: { enabled: false }, max_tokens: 1_000 });
    expect(bodies[1]).toMatchObject({ reasoning: { effort: 'low' } });
    // The floor is billed against the answer budget, so the budget grows.
    expect(bodies[1].max_tokens).toBeGreaterThan(1_000);
    expect(requiresReasoningNow(UNFLAGGED)).toBe(true);
  });

  it('reaches a structured call, which a replaced invoke never did', async () => {
    // The whole point of mc2-148j9: `withStructuredOutput` builds
    // `new ChatOpenAI(this.fields)`, so only constructor fields survive. If the
    // recovery were on `invoke` this would make one request and fail with the
    // provider's 400.
    const { fetchImpl, bodies, calls } = fakeFetch(1);
    const structured = modelOn(fetchImpl).withStructuredOutput(z.object({ answer: z.string() }), {
      name: 'extract',
    });

    await structured.invoke('hello').catch(() => undefined);

    expect(calls).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toMatchObject({ reasoning: { effort: 'low' } });
  });

  it('gives up rather than looping when the floor is refused too', async () => {
    const { fetchImpl, calls } = fakeFetch(2);

    await expect(modelOn(fetchImpl).invoke('hello')).rejects.toThrow(/mandatory/);

    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('does not touch a 400 that is about something else', async () => {
    const other = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'context length exceeded' } }), {
          status: 400,
        })
    );

    await expect(
      modelOn(other as unknown as typeof globalThis.fetch).invoke('hello')
    ).rejects.toThrow(/context length/);

    expect(other).toHaveBeenCalledTimes(1);
    expect(requiresReasoningNow(UNFLAGGED)).toBe(false);
  });
});
