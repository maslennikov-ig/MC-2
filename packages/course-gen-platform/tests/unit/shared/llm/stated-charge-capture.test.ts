/**
 * Contract: the transport keeps the charge OpenRouter stated, and gives it up
 * exactly once (mc2-2sv4a).
 *
 * `usage.cost` is in every completion body — measured on the live API on
 * 2026-08-25, present with and without `usage: {include: true}`, equal to
 * `GET /api/v1/generation` to the cent. `@langchain/openai` drops it while
 * building `llmOutput`, so the LangChain path priced its calls from the
 * catalogue and waited for a receipt that 92 of 509 rows in a fortnight never
 * got. This is where the number is caught instead.
 *
 * The three boundaries below each cost this repository money when broken: zero
 * is a measurement, the map has to shrink again, and a miss must change nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { guardAgainstEmptyCompletion } from '@/shared/llm/empty-response-guard';
import {
  pendingStatedChargeCount,
  rememberStatedCharge,
  rememberStatedChargeFromBody,
  resetStatedCharges,
  takeStatedCharge,
  STATED_CHARGE_CAPACITY,
} from '@/shared/llm/stated-charge-capture';

const COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

/** A body in the shape OpenRouter actually returns, cost included. */
function completionBody(id: string, cost: number | undefined): string {
  return JSON.stringify({
    id,
    object: 'chat.completion',
    model: 'openai/gpt-5.6-luna',
    choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 13,
      completion_tokens: 5,
      total_tokens: 18,
      ...(cost === undefined ? {} : { cost }),
    },
  });
}

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  resetStatedCharges();
});

describe('the guard keeps the charge on its way past', () => {
  it('captures usage.cost under the id from the same body', async () => {
    const guarded = guardAgainstEmptyCompletion(
      vi.fn(() => Promise.resolve(jsonResponse(completionBody('gen-priced', 0.000004257))))
    );

    await guarded(COMPLETIONS, { method: 'POST' });

    expect(takeStatedCharge('gen-priced')).toBe(0.000004257);
  });

  it('hands the body on untouched, because the caller still has to parse it', async () => {
    const guarded = guardAgainstEmptyCompletion(
      vi.fn(() => Promise.resolve(jsonResponse(completionBody('gen-intact', 0.0002))))
    );

    const response = await guarded(COMPLETIONS, { method: 'POST' });

    expect(await response.json()).toMatchObject({
      id: 'gen-intact',
      usage: { cost: 0.0002 },
    });
  });

  it('keeps a stated $0, which is a measurement and not an absence', async () => {
    // `|| null` on a genuine zero is what once filed a measured call as
    // "not measured" and corrupted the metric used to find unpriced calls
    // (mc2-y452l). A free model and a cached prefix both charge exactly this.
    const guarded = guardAgainstEmptyCompletion(
      vi.fn(() => Promise.resolve(jsonResponse(completionBody('gen-free', 0))))
    );

    await guarded(COMPLETIONS, { method: 'POST' });

    expect(takeStatedCharge('gen-free')).toBe(0);
  });

  it('captures nothing from a body that states no charge', async () => {
    const guarded = guardAgainstEmptyCompletion(
      vi.fn(() => Promise.resolve(jsonResponse(completionBody('gen-silent', undefined))))
    );

    await guarded(COMPLETIONS, { method: 'POST' });

    expect(takeStatedCharge('gen-silent')).toBeUndefined();
    expect(pendingStatedChargeCount()).toBe(0);
  });

  it('captures nothing from a response with no completion in it', async () => {
    const guarded = guardAgainstEmptyCompletion(
      vi.fn(() => Promise.resolve(jsonResponse(JSON.stringify({ id: 'gen-empty', choices: [] }))))
    );

    await expect(guarded(COMPLETIONS, { method: 'POST' })).rejects.toThrow(/choices is empty/u);
    expect(pendingStatedChargeCount()).toBe(0);
  });

  it('writes nothing to the ledger itself', async () => {
    // The callback stays the only writer. A wrapper that also recorded would
    // double every row it touched.
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../../../../src/shared/llm/empty-response-guard.ts', import.meta.url),
        'utf8'
      )
    );

    expect(source).not.toContain('recordLlmCallCost');
    expect(source).not.toContain('logTrace');
  });
});

describe('the map gives a charge up once and then shrinks', () => {
  it('forgets the entry it just handed over', () => {
    rememberStatedCharge('gen-once', 0.5);
    expect(pendingStatedChargeCount()).toBe(1);

    expect(takeStatedCharge('gen-once')).toBe(0.5);

    expect(pendingStatedChargeCount()).toBe(0);
    expect(takeStatedCharge('gen-once')).toBeUndefined();
  });

  it('drops the oldest uncollected charge rather than growing without end', () => {
    // Not every charge is collected: a model built without a course id has no
    // cost callback at all, and an aborted call never reaches handleLLMEnd. This
    // runs in a worker that lives for weeks.
    for (let i = 0; i < STATED_CHARGE_CAPACITY + 50; i += 1) {
      rememberStatedCharge(`gen-${i}`, i);
    }

    expect(pendingStatedChargeCount()).toBe(STATED_CHARGE_CAPACITY);
    expect(takeStatedCharge('gen-0')).toBeUndefined();
    expect(takeStatedCharge(`gen-${STATED_CHARGE_CAPACITY + 49}`)).toBe(
      STATED_CHARGE_CAPACITY + 49
    );
  });

  it('treats a repeated id as the later truth, without keeping two entries', () => {
    rememberStatedCharge('gen-twice', 0.1);
    rememberStatedCharge('gen-twice', 0.2);

    expect(pendingStatedChargeCount()).toBe(1);
    expect(takeStatedCharge('gen-twice')).toBe(0.2);
  });
});

describe('a miss is not an error', () => {
  it('answers undefined for an id nobody captured', () => {
    expect(takeStatedCharge('gen-never-seen')).toBeUndefined();
  });

  it('answers undefined when there is no id to ask with', () => {
    expect(takeStatedCharge(undefined)).toBeUndefined();
    expect(takeStatedCharge('')).toBeUndefined();
  });

  it('ignores bodies that are not completions instead of throwing', () => {
    for (const body of [
      null,
      'a string',
      42,
      {},
      { id: 'gen-x' },
      { id: 'gen-x', usage: null },
      { id: 'gen-x', usage: { cost: 'free' } },
      { usage: { cost: 0.1 } },
      { id: '', usage: { cost: 0.1 } },
    ]) {
      expect(() => rememberStatedChargeFromBody(body)).not.toThrow();
    }

    expect(pendingStatedChargeCount()).toBe(0);
  });

  it('refuses a charge that is not a finite number', () => {
    rememberStatedCharge('gen-nan', Number.NaN);
    rememberStatedCharge('gen-inf', Number.POSITIVE_INFINITY);

    expect(pendingStatedChargeCount()).toBe(0);
  });
});
