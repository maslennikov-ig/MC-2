/**
 * Contract: a phase that did not ask for reasoning says so on the wire.
 *
 * Silence is not "off". Several catalogued models — DeepSeek V4 Flash among
 * them — deliberate by default, and OpenRouter bills that against `max_tokens`.
 * Measured against the live provider on 2026-08-14: the same 20-token request
 * returned 19 reasoning tokens and no content in 11.1s with reasoning left
 * unsaid, and "Париж" in 4 tokens and 3.7s with `reasoning: {enabled: false}`.
 *
 * Live consequence (mc2-2pplo): Stage 2 summarization spent its whole budget
 * deliberating, produced nothing, hit its 60s bound on every retry, and the
 * course never left `stage_2_processing`.
 */

import { describe, expect, it } from 'vitest';

import { buildCompletionRequest } from '@/shared/llm/client-helpers';
import { buildProviderParams } from '@/shared/llm/langchain-models';

/** The Stage 2 default: a model that reasons unless told not to. */
const REASONING_MODEL = '~deepseek/deepseek-v4-flash-latest';
/** A catalogued model that does not accept the control at all. */
const PLAIN_MODEL = 'google/gemini-2.5-flash-image';

describe('reasoning off is explicit', () => {
  it('turns reasoning off on the OpenAI-SDK path when the phase is silent', () => {
    const [, request] = buildCompletionRequest(
      REASONING_MODEL,
      'Перескажи статью',
      'Ты составляешь краткие изложения',
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.reasoning).toEqual({ enabled: false });
  });

  it('turns reasoning off on the LangChain path when the phase is silent', () => {
    const params = buildProviderParams(REASONING_MODEL, 0.7, 4096, undefined);

    expect(params.modelKwargs.reasoning).toEqual({ enabled: false });
    expect(params.maxTokens).toBe(4096);
  });

  it('still asks for reasoning, with its own budget, when the phase wants it', () => {
    const [, request] = buildCompletionRequest(
      REASONING_MODEL,
      'Разбери сложный случай',
      'Ты рассуждаешь',
      4096,
      0.7,
      false,
      { enabled: true, maxTokens: 2000 }
    );

    expect(request.reasoning).toEqual({ max_tokens: 2000 });
    // The reasoning budget is added, never taken out of the answer budget.
    expect(request.max_tokens).toBe(6096);
  });

  it('says nothing to a model that does not take the control', () => {
    const [, request] = buildCompletionRequest(
      PLAIN_MODEL,
      'Перескажи статью',
      'Ты составляешь краткие изложения',
      4096,
      0.7,
      false,
      undefined
    );

    expect(request.reasoning).toBeUndefined();
    expect(
      buildProviderParams(PLAIN_MODEL, 0.7, 4096, undefined).modelKwargs.reasoning
    ).toBeUndefined();
  });
});
