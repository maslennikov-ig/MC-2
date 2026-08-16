/**
 * Contract: a model that cannot stop deliberating is asked for the least of it,
 * never for none.
 *
 * Saying `reasoning: {enabled: false}` to such a model is not a degraded
 * answer, it is `400 Reasoning is mandatory for this endpoint and cannot be
 * disabled` on every call. A live run (mc2-2pplo, 2026-08-15) lost three
 * consecutive title generations to it, once mc2-5gdzw taught both builders to
 * say "no reasoning" out loud and 2d4a9f1e3 routed Gemini to 3.7-flash.
 *
 * Measured against the live provider on 2026-08-15 across the whole catalogue:
 * five models refuse the disable — gemini-3.7-flash, minimax-m2, minimax-m2.1,
 * kimi-k2-thinking, gpt-oss-20b — and all five accept `effort: 'low'`.
 */

import { describe, expect, it } from 'vitest';
import {
  MANDATORY_REASONING_RESERVE_TOKENS,
  MODEL_CATALOG,
  modelRequiresReasoning,
} from '@megacampus/shared-types';

import { buildCompletionRequest, buildChatCompletionRequest } from '@/shared/llm/client-helpers';
import { buildProviderParams } from '@/shared/llm/langchain-models';

/** Refuses the disable; ceiling 65536, so the reserve fits. */
const MANDATORY_MODEL = 'google/gemini-3.7-flash';
/** Accepts the disable, and is the Stage 2/4 default. */
const OPTIONAL_MODEL = '~deepseek/deepseek-v4-flash-latest';

describe('models that mandate reasoning', () => {
  it('asks the OpenAI-SDK path for the lowest effort instead of none', () => {
    const [, request] = buildCompletionRequest(
      MANDATORY_MODEL,
      'Придумай заголовок',
      'Ты придумываешь заголовки',
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.reasoning).toEqual({ effort: 'low' });
  });

  it('grows the answer budget by the reserve the provider will bill against it', () => {
    const [, request] = buildCompletionRequest(
      MANDATORY_MODEL,
      'Придумай заголовок',
      'Ты придумываешь заголовки',
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.max_tokens).toBe(4096 + MANDATORY_REASONING_RESERVE_TOKENS);
  });

  it('never grows the budget past what the model will accept', () => {
    const ceiling = MODEL_CATALOG[MANDATORY_MODEL].maxOutputTokens;
    expect(ceiling).toBe(65_536);

    const [, request] = buildCompletionRequest(
      MANDATORY_MODEL,
      'Придумай заголовок',
      'Ты придумываешь заголовки',
      ceiling! - 10,
      0.7,
      false,
      undefined
    );

    expect(request.max_tokens).toBe(ceiling);
  });

  it('applies the same floor on the multi-turn path', () => {
    const [, request] = buildChatCompletionRequest(
      MANDATORY_MODEL,
      [{ role: 'user', content: 'Придумай заголовок' }],
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.reasoning).toEqual({ effort: 'low' });
    expect(request.max_tokens).toBe(4096 + MANDATORY_REASONING_RESERVE_TOKENS);
  });

  it('applies the same floor on the LangChain path', () => {
    const params = buildProviderParams(MANDATORY_MODEL, 0.7, 4096, undefined);

    expect(params.modelKwargs.reasoning).toEqual({ effort: 'low' });
    expect(params.maxTokens).toBe(4096 + MANDATORY_REASONING_RESERVE_TOKENS);
  });

  it('leaves a model that accepts the disable exactly as it was', () => {
    const [, request] = buildCompletionRequest(
      OPTIONAL_MODEL,
      'Перескажи статью',
      'Ты составляешь краткие изложения',
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.reasoning).toEqual({ enabled: false });
    expect(request.max_tokens).toBe(4096);
    expect(buildProviderParams(OPTIONAL_MODEL, 0.7, 4096, undefined).maxTokens).toBe(4096);
  });

  it('still honours a phase that does ask for deliberation', () => {
    const [, request] = buildCompletionRequest(
      MANDATORY_MODEL,
      'Разбери сложный случай',
      'Ты рассуждаешь',
      4096,
      0.7,
      false,
      { enabled: true, maxTokens: 2000 }
    );

    expect(request.reasoning).toEqual({ max_tokens: 2000 });
    expect(request.max_tokens).toBe(6096);
  });

  it('names exactly the models measured as refusing the disable', () => {
    const flagged = Object.keys(MODEL_CATALOG).filter(id => modelRequiresReasoning(id));

    expect(flagged.sort()).toEqual([
      'google/gemini-3.7-flash',
      'google/gemini-3.7-flash:batch',
      'minimax/minimax-m2',
      'minimax/minimax-m2.1',
      'moonshotai/kimi-k2-thinking',
      'openai/gpt-oss-20b',
    ]);
  });
});
