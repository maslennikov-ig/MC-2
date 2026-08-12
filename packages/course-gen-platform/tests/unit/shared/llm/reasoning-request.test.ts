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

    expect(options.reasoning).toEqual({ effort: 'high', max_tokens: 8000 });
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

    expect(options.reasoning).toEqual({ effort: 'low', max_tokens: 4000 });
    expect(options.max_tokens).toBe(16000);
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
