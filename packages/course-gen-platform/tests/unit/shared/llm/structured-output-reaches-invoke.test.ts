/**
 * What `withStructuredOutput()` does to a model we already instrumented.
 *
 * The plan for mc2-258fi asked for this to be proven before the fix was written,
 * because the fix was going to replace `model.invoke` in one place and rely on
 * every call site reaching it. Four call sites reach the model through
 * `withStructuredOutput` instead (`tournament-classification.ts:357` and `:395`,
 * `classification-helpers.ts:245`, `runtime.ts:389`).
 *
 * Measured on @langchain/openai 1.4.7 / @langchain/core 1.1.48: it does not
 * reach it. `ChatOpenAI.withConfig` — which `withStructuredOutput` and
 * `bindTools` both funnel through — is overridden to build `new
 * ChatOpenAI(this.fields)`. The clone carries the constructor fields and nothing
 * else, so anything attached to the instance afterwards is dropped:
 *
 *   - a replaced `invoke` (mandatory-reasoning recovery, and the generation-id
 *     slot this plan was about to add);
 *   - `model.callbacks`, which is how `attachCostRecording` records a price.
 *
 * The second one is money: a structured call priced nothing at all.
 *
 * These tests state the LangChain behaviour, not our wish. If an upgrade makes
 * `withConfig` preserve the instance, they fail and the compensation in
 * `attachCostRecording` can be removed.
 */

import { AIMessageChunk } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const SCHEMA = z.object({ answer: z.string() });

function buildModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: 'openai/gpt-oss-20b',
    apiKey: 'test-key',
    // Nothing is allowed to leave the machine: every test here either stops at
    // the replaced `invoke` or asserts on the object graph.
    configuration: { baseURL: 'http://127.0.0.1:1/never-reached' },
  });
}

/** Exactly the shape `withMandatoryReasoningRecovery` uses. */
function replaceInvoke(model: ChatOpenAI, reached: string[]): void {
  model.invoke = (async () => {
    reached.push('invoke');
    return new AIMessageChunk({
      content: '',
      tool_calls: [{ id: 'call_1', name: 'extract', args: { answer: 'ok' } }],
    });
  }) as ChatOpenAI['invoke'];
}

describe('what withStructuredOutput keeps from the model it was called on', () => {
  it('routes a direct .invoke() through the replacement', async () => {
    const model = buildModel();
    const reached: string[] = [];
    replaceInvoke(model, reached);

    await model.invoke('anything');

    expect(reached).toEqual(['invoke']);
  });

  it('builds a different instance, so the replaced invoke is not reached', () => {
    const model = buildModel();
    replaceInvoke(model, []);

    const structured = model.withStructuredOutput(SCHEMA) as unknown as { first: ChatOpenAI };

    expect(structured.first).toBeInstanceOf(ChatOpenAI);
    expect(structured.first).not.toBe(model);
    expect(Object.prototype.hasOwnProperty.call(structured.first, 'invoke')).toBe(false);
  });

  it('drops callbacks attached after construction — the cost recording', () => {
    const model = buildModel();
    model.callbacks = [{ handleLLMEnd: async () => {} }];

    const clone = model.withConfig({ tools: [] }) as ChatOpenAI;

    expect(model.callbacks).toHaveLength(1);
    expect(clone.callbacks).toBeUndefined();
  });

  it('drops them through bindTools too, which withStructuredOutput uses', () => {
    const model = buildModel();
    model.callbacks = [{ handleLLMEnd: async () => {} }];

    const bound = model.bindTools([
      { type: 'function', function: { name: 'extract', parameters: { type: 'object' } } },
    ]) as unknown as ChatOpenAI;

    expect(bound.callbacks).toBeUndefined();
  });
});
