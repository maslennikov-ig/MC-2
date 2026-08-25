/**
 * Makes a LangChain model price its own calls.
 *
 * The token split lives in the provider's response and is lost by the time a
 * calling node reports one total, so pricing has to happen at the call. This is
 * the LangChain half of that; the OpenAI-SDK half is in `client.ts` (mc2-o7740).
 *
 * @module shared/llm/model-cost-callbacks
 */

import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { LLMResult } from '@langchain/core/outputs';

import { recordLlmCallCost, type LlmCostContext } from '../metrics/llm-cost';

/**
 * The stage a phase belongs to, read off the phase name.
 *
 * Phase names are built at runtime (`stage_6_${tier}`), so the prefix is the
 * only reliable link back to a stage.
 *
 * Stage 7 was outside this range until 2026-08-16, so every enrichment call —
 * covers, cards, quizzes, video scripts — was priced by nobody and left no
 * trace row at all.
 */
export function stageOfPhase(phase: string): LlmCostContext['stage'] | undefined {
  const match = /^stage_([1-7])(?:_|$)/u.exec(phase);
  if (match) return `stage_${match[1]}` as LlmCostContext['stage'];
  // Editing phases are named after what the user did, not after a stage:
  // `chat_stage_6_refinement`, `inline_element_crud`. They had no stage, so this
  // returned undefined and the model was handed back with no cost recording at
  // all (mc2-b7olk.5).
  if (/^(chat|inline)_/u.test(phase)) return 'stage_edit';
  return undefined;
}

/**
 * OpenRouter's own name for this call, as LangChain hands it back.
 *
 * The provider's figure is fetched with it later, and until 2026-08-21 no call
 * on this path had one: the id was being read off the `x-generation-id` response
 * header into an `AsyncLocalStorage` slot that nothing here ever opened. The
 * same `gen-…` value is in the response body as `id`, and LangChain puts it on
 * the message — no slot, no wrapped transport, no ordering to get wrong
 * (mc2-258fi).
 *
 * The header still matters for the calls that never produce a message: an abort
 * has no `handleLLMEnd`, and the Career Playbook reads its id from the slot.
 */
function generationIdOf(output: LLMResult): string | undefined {
  const generation = output.generations?.[0]?.[0] as { message?: { id?: unknown } } | undefined;
  const id = generation?.message?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * The callbacks that make a LangChain model price its own calls.
 *
 * Returned for the constructor, never assigned to a built model. `ChatOpenAI`
 * implements `withConfig` — which `withStructuredOutput` and `bindTools` both go
 * through — as `new ChatOpenAI(this.fields)`, deliberately, so that two bound
 * models cannot share state (langchainjs#8586). The clone therefore carries the
 * constructor fields and nothing else: callbacks assigned afterwards were
 * dropped, and every structured call recorded no cost at all. Constructor
 * callbacks are in `fields`, so they survive, and the behaviour is identical in
 * @langchain/openai 1.4.7 and 1.5.10 — this is the supported shape, not a
 * workaround for a version. `tests/unit/shared/llm/structured-output-reaches-invoke.test.ts`
 * fails if that ever changes.
 *
 * Without a course id there is nothing to attribute the cost to, and nothing is
 * returned.
 */
export function costRecordingCallbacks(
  modelId: string,
  phase: string,
  courseId?: string
): Callbacks | undefined {
  const stage = stageOfPhase(phase);
  if (!courseId || !stage) return undefined;

  return [
    {
      handleLLMEnd: async (output: LLMResult) => {
        const usage = (output.llmOutput?.tokenUsage ?? {}) as {
          promptTokens?: number;
          completionTokens?: number;
        };
        if (usage.promptTokens === undefined && usage.completionTokens === undefined) return;
        const generationId = generationIdOf(output);
        // No `serviceTier` here on purpose. LangChain hands back `tokenUsage`
        // and little else, so the tier this call was served at is not knowable
        // from `llmOutput` — and guessing it from the phase would halve the
        // estimate for a model that has no flex endpoint. The estimate stays at
        // the default tariff and `settleTraceCostFromProvider` replaces it with
        // the real charge, and the real tier, about ten seconds later.
        await recordLlmCallCost(
          {
            model: modelId,
            inputTokens: usage.promptTokens ?? 0,
            outputTokens: usage.completionTokens ?? 0,
            ...(generationId ? { generationId } : {}),
          },
          { courseId, stage, phase }
        );
      },
    },
  ];
}
