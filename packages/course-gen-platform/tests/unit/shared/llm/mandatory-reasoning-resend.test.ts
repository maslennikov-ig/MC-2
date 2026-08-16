/**
 * Contract: the recovery actually re-sends the call, and the second request
 * carries the floor.
 *
 * Remembering the model is only half of it. The refused request has to be the
 * one that gets retried, and it has to differ — a retry of the identical body
 * is refused identically, three times, and the course still dies. This test
 * exists because the first half was easy to verify by reading and the second
 * was not (mc2-qrdkt.3).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const stub = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  // The request body is mutated in place on the way to the retry, so vitest's
  // recorded reference is the mutated one. Snapshot each body at call time.
  const sent: Array<Record<string, unknown>> = [];
  const create = vi.fn((body: Record<string, unknown>) => {
    sent.push(JSON.parse(JSON.stringify(body)) as Record<string, unknown>);
    return behaviour.shift()?.();
  });
  const behaviour: Array<() => unknown> = [];
  return { create, sent, behaviour, FakeApiError };
});
const { create, sent, behaviour, FakeApiError } = stub;

vi.mock('openai', () => {
  class FakeOpenAI {
    chat = { completions: { create: stub.create } };
    static APIError = stub.FakeApiError;
  }
  return { default: FakeOpenAI, APIError: stub.FakeApiError };
});

vi.mock('@/shared/metrics/llm-cost', () => ({
  recordLlmCallCost: vi.fn(),
  calculateLlmCostUsd: () => 0,
}));

import { LLMClient } from '@/shared/llm/client';
import { forgetLearnedMandatoryReasoning } from '@/shared/llm/mandatory-reasoning-recovery';

const UNFLAGGED = 'some-vendor/thinker-not-in-the-catalogue';

function completion() {
  return {
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: UNFLAGGED,
    id: 'req-1',
  };
}

describe('mandatory reasoning: the second request', () => {
  beforeEach(() => {
    forgetLearnedMandatoryReasoning();
    create.mockClear();
    sent.length = 0;
    behaviour.length = 0;
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('re-sends with the reasoning floor after the provider refuses', async () => {
    behaviour.push(
      () => {
        throw new FakeApiError(
          400,
          'Reasoning is mandatory for this endpoint and cannot be disabled'
        );
      },
      () => completion()
    );

    const client = new LLMClient();
    const response = await client.generateCompletion('Hello', {
      model: UNFLAGGED,
      maxTokens: 1_000,
    });

    expect(response.content).toBe('ok');
    expect(sent).toHaveLength(2);

    // The model is not in the catalogue, so nothing asked for reasoning at all
    // the first time. The second request is the interesting one.
    expect(sent[0].reasoning).toBeUndefined();
    expect(sent[1].reasoning).toEqual({ effort: 'low' });
    expect(sent[1].max_tokens).toBeGreaterThan(sent[0].max_tokens as number);
  });

  it('does not re-send for a bad request that is about something else', async () => {
    for (let i = 0; i < 8; i += 1) {
      behaviour.push(() => {
        throw new FakeApiError(400, 'max_tokens is larger than the context window');
      });
    }

    const client = new LLMClient({ maxRetries: 1 });
    await expect(
      client.generateCompletion('Hello', { model: UNFLAGGED, maxTokens: 1_000 })
    ).rejects.toThrow();

    // Whatever the transport retry policy is, no attempt asked for deliberation.
    expect(sent.length).toBeGreaterThan(0);
    for (const body of sent) {
      expect(body.reasoning).toBeUndefined();
    }
  });
  it('fixes every request in flight, not only the one that discovered it', async () => {
    // Two calls to the same unflagged model are refused at once. Only the first
    // is news; if the retry were gated on being news, the second would re-send
    // the body that was just refused and die with attempts in hand.
    // Refuse asynchronously, so both requests are built and sent before either
    // refusal is handled. That is what concurrency looks like, and it is the
    // only ordering in which the second call cannot have learned from the first.
    const refuse = () =>
      new Promise((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new FakeApiError(
                400,
                'Reasoning is mandatory for this endpoint and cannot be disabled'
              )
            ),
          0
        )
      );
    behaviour.push(
      refuse,
      refuse,
      () => completion(),
      () => completion()
    );

    const client = new LLMClient();
    const both = await Promise.all([
      client.generateCompletion('One', { model: UNFLAGGED, maxTokens: 1_000 }),
      client.generateCompletion('Two', { model: UNFLAGGED, maxTokens: 1_000 }),
    ]);

    expect(both.map(r => r.content)).toEqual(['ok', 'ok']);
    expect(sent).toHaveLength(4);
    expect(sent[2].reasoning).toEqual({ effort: 'low' });
    expect(sent[3].reasoning).toEqual({ effort: 'low' });
  });
});
