/**
 * Reasoning request construction (mc2-v9xom).
 *
 * The dangerous part of reasoning is not whether the parameter arrives — it is
 * the token budget. OpenRouter bills reasoning tokens against the same
 * `max_tokens` as the answer, so enabling reasoning without enlarging the
 * budget buys deliberation by truncating the reply. These tests pin that the
 * budget is ADDED, and that a model which cannot reason is never sent the
 * parameter at all.
 */
import { describe, expect, it } from 'vitest';

import { buildCompletionRequest, buildChatCompletionRequest } from '@/shared/llm/client-helpers';

const REASONING_MODEL = 'openai/gpt-5.6-luna';
const NON_REASONING_MODEL = 'qwen/qwen3-235b-a22b-2507';

describe('reasoning request construction', () => {
  it('omits reasoning entirely when the phase does not ask for it', () => {
    const [, options] = buildCompletionRequest(REASONING_MODEL, 'p', 's', 8000, 0.7, false);

    expect(options.reasoning).toBeUndefined();
    expect(options.max_tokens).toBe(8000);
  });

  it('adds the reasoning budget on top of the answer budget', () => {
    const [, options] = buildCompletionRequest(REASONING_MODEL, 'p', 's', 8000, 0.7, false, {
      enabled: true,
      effort: 'high',
      maxTokens: 8000,
    });

    // Only the budget goes out: OpenRouter answers 400 to a request carrying
    // both controls, and this shape is what the phase config produces.
    expect(options.reasoning).toEqual({ max_tokens: 8000 });
    // 8000 for the answer plus 8000 to think with — not 8000 shared between them.
    expect(options.max_tokens).toBe(16000);
  });

  it('does the same for multi-turn chat requests', () => {
    const [, options] = buildChatCompletionRequest(
      REASONING_MODEL,
      [{ role: 'user', content: 'p' }],
      12000,
      0.7,
      false,
      { enabled: true, effort: 'low', maxTokens: 4000 }
    );

    expect(options.reasoning).toEqual({ max_tokens: 4000 });
    expect(options.max_tokens).toBe(16000);
  });

  it('sends the effort when a phase configures one without a budget', () => {
    const [, options] = buildCompletionRequest(REASONING_MODEL, 'p', 's', 8000, 0.7, false, {
      enabled: true,
      effort: 'medium',
    });

    expect(options.reasoning).toEqual({ effort: 'medium' });
    // Nothing to add: there is no reasoning budget to grow the answer budget by.
    expect(options.max_tokens).toBe(8000);
  });

  it('never sends both controls, which is what the provider rejects', () => {
    // `stage_6_complex` and its two siblings carry an effort and a budget, so
    // every complex-tier Stage 6 generation was answered with
    // `400 Only one of "reasoning.effort" and "reasoning.max_tokens" can be
    // specified`. Observed on a live run 2026-08-13.
    const shapes = [
      { enabled: true, effort: 'high' as const, maxTokens: 8000 },
      { enabled: true, effort: 'low' as const, maxTokens: 1 },
    ];

    for (const reasoning of shapes) {
      const [, options] = buildCompletionRequest(
        REASONING_MODEL,
        'p',
        's',
        8000,
        0.7,
        false,
        reasoning
      );
      const sent = Object.keys(options.reasoning ?? {});
      expect(sent).toHaveLength(1);
      expect(sent).toEqual(['max_tokens']);
    }
  });

  it('never sends reasoning to a model that does not accept it', () => {
    const [, options] = buildCompletionRequest(NON_REASONING_MODEL, 'p', 's', 8000, 0.7, false, {
      enabled: true,
      effort: 'high',
      maxTokens: 8000,
    });

    expect(options.reasoning).toBeUndefined();
    // The budget must not grow either: nothing is going to be spent thinking.
    expect(options.max_tokens).toBe(8000);
  });

  it('still omits temperature for a model that ignores it, reasoning or not', () => {
    const [, withReasoning] = buildCompletionRequest(REASONING_MODEL, 'p', 's', 8000, 0.7, false, {
      enabled: true,
      effort: 'high',
      maxTokens: 2000,
    });
    const [, without] = buildCompletionRequest(REASONING_MODEL, 'p', 's', 8000, 0.7, false);

    expect(withReasoning.temperature).toBeUndefined();
    expect(without.temperature).toBeUndefined();
  });

  it('keeps temperature for models that honour it', () => {
    const [, options] = buildCompletionRequest(NON_REASONING_MODEL, 'p', 's', 8000, 0.3, false);

    expect(options.temperature).toBe(0.3);
  });
});
