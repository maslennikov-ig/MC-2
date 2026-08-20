/**
 * Surviving a model that refuses to stop thinking, without a paid run to find it.
 *
 * `MODEL_CATALOG` carries a `requiresReasoning` flag, and it is honest today
 * because every catalogued model was measured against the live API on
 * 2026-08-15. It is a hand-kept fact about someone else's service: OpenRouter's
 * `supported_parameters` lists `reasoning` for models that accept
 * `{enabled:false}` and for models that answer `400 Reasoning is mandatory for
 * this endpoint and cannot be disabled`, so nothing in the API distinguishes
 * them. The next model added, or an existing one changing its mind, brings the
 * same defect back — and the last time it cost a live course (mc2-2pplo).
 *
 * So the flag is treated as a head start, not as the truth. When a request is
 * refused for that reason the model is remembered for the life of the process
 * and every later request asks for the least deliberation instead of none. The
 * remembering is logged at warn precisely so the catalogue gets corrected: this
 * is a net, not a replacement for the entry.
 *
 * @module shared/llm/mandatory-reasoning-recovery
 */

import type { ChatOpenAI } from '@langchain/openai';
import { modelRequiresReasoning } from '@megacampus/shared-types';

import logger from '../logger';

/** Models this process has watched refuse `reasoning: { enabled: false }`. */
const learned = new Set<string>();

/**
 * Whether the refusal is the provider saying deliberation cannot be switched
 * off, as opposed to any other bad request.
 *
 * The provider gives no code for it, only the sentence, so the sentence is what
 * is matched — loosely enough to survive rewording, tightly enough not to catch
 * an unrelated 400.
 */
export function isMandatoryReasoningRejection(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (status !== undefined && status !== 400) return false;

  const message = error instanceof Error ? error.message : '';
  const said = message.toLowerCase();
  if (!said.includes('reasoning')) return false;
  return said.includes('mandatory') || said.includes('cannot be disabled');
}

/**
 * Remember a model that refused, and say whether this is news.
 *
 * @returns `true` the first time, so the caller knows a retry is worth making —
 *   a second refusal from a model already flagged is a different problem.
 */
export function rememberMandatoryReasoning(modelId: string): boolean {
  if (learned.has(modelId) || modelRequiresReasoning(modelId)) return false;
  learned.add(modelId);
  logger.warn(
    { modelId },
    'Model refuses to disable reasoning but is not flagged in MODEL_CATALOG - ' +
      'asking for the least of it from now on; add requiresReasoning to the catalogue entry'
  );
  return true;
}

/** Whether this model must be given some reasoning, by catalogue or by lesson. */
export function requiresReasoningNow(modelId: string): boolean {
  return modelRequiresReasoning(modelId) || learned.has(modelId);
}

/** Test seam: forget what this process learned. */
export function forgetLearnedMandatoryReasoning(): void {
  learned.clear();
}

/**
 * Lets a model survive discovering that it must think.
 *
 * A model whose catalogue entry is missing `requiresReasoning` refuses every
 * call with the same 400, so retrying the same request cannot help. The refusal
 * is remembered, the model is rebuilt — `buildProviderParams` then asks for the
 * least deliberation instead of none — and the call is made once more.
 *
 * The retry is allowed once per invocation, not once per model. Under
 * concurrency several calls to the same model are refused at once and only the
 * first of them is news; gating the retry on being first would let every other
 * in-flight call fail on a request nobody fixed.
 *
 * Only `invoke` is wrapped, which is what this codebase calls — directly and
 * through `withStructuredOutput`, whose binding delegates to it. `stream` and
 * `batch` would not be covered.
 */
export function withMandatoryReasoningRecovery(
  model: ChatOpenAI,
  modelId: string,
  rebuild: () => ChatOpenAI
): ChatOpenAI {
  const invoke = model.invoke.bind(model);
  model.invoke = (async (...args: Parameters<ChatOpenAI['invoke']>) => {
    try {
      return await invoke(...args);
    } catch (error) {
      if (!isMandatoryReasoningRejection(error)) throw error;
      rememberMandatoryReasoning(modelId);
      const retryModel = rebuild();
      // The rebuild is a fresh instance, and everything attached to the model
      // after it was wrapped - cost recording above all - lives on the old one.
      // Read the callbacks now rather than at wrap time: `attachCostRecording`
      // runs after this function returns, so at wrap time there are none.
      retryModel.callbacks = model.callbacks;
      return await retryModel.invoke(...args);
    }
  }) as ChatOpenAI['invoke'];
  return model;
}
