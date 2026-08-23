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

import {
  getModelCapabilities,
  MANDATORY_REASONING_RESERVE_TOKENS,
  modelRequiresReasoning,
} from '@megacampus/shared-types';

import logger from '../logger';

/** Models this process has watched refuse `reasoning: { enabled: false }`. */
const learned = new Set<string>();

/**
 * Whether this text is the provider saying deliberation cannot be switched off.
 *
 * The provider gives no code for it, only the sentence, so the sentence is what
 * is matched — loosely enough to survive rewording, tightly enough not to catch
 * an unrelated 400. Shared by the two places that meet the refusal: the SDK path
 * meets it as an `APIError`, the LangChain path as a 400 response body.
 */
function saysReasoningIsMandatory(text: string): boolean {
  const said = text.toLowerCase();
  if (!said.includes('reasoning')) return false;
  return said.includes('mandatory') || said.includes('cannot be disabled');
}

/**
 * Whether the refusal is the provider saying deliberation cannot be switched
 * off, as opposed to any other bad request.
 */
export function isMandatoryReasoningRejection(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (status !== undefined && status !== 400) return false;

  return saysReasoningIsMandatory(error instanceof Error ? error.message : '');
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
 * Put the reasoning floor into a request body that was just refused.
 *
 * The same arithmetic as `applyMandatoryReasoningFloor` on the SDK path, done
 * on the wire format rather than on an options object: ask for the least
 * deliberation, and grow the answer budget by what the provider is going to
 * bill against it, capped by what the model can emit.
 *
 * @returns the retry's `init`, or `undefined` when this request must not be
 *   retried — a body that is not JSON, or one that already carries the floor
 *   and was refused anyway, which is a different problem.
 */
function withReasoningFloorInBody(
  init: RequestInit | undefined,
  modelId: string
): RequestInit | undefined {
  const body = init?.body;
  if (typeof body !== 'string') return undefined;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object') return undefined;

  const reasoning = payload.reasoning as { effort?: unknown } | undefined;
  if (reasoning?.effort === 'low') return undefined;
  payload.reasoning = { effort: 'low' };

  // OpenRouter takes `max_tokens`; `max_completion_tokens` is what the OpenAI
  // SDK sends for the models that only accept that name.
  const budgetKey =
    typeof payload.max_tokens === 'number'
      ? 'max_tokens'
      : typeof payload.max_completion_tokens === 'number'
        ? 'max_completion_tokens'
        : null;
  if (budgetKey) {
    const ceiling = getModelCapabilities(modelId)?.maxOutputTokens ?? null;
    const grown = (payload[budgetKey] as number) + MANDATORY_REASONING_RESERVE_TOKENS;
    payload[budgetKey] = ceiling === null ? grown : Math.min(grown, ceiling);
  }

  // A stale `content-length` would describe the body that was refused.
  const headers = new Headers(init?.headers);
  headers.delete('content-length');

  return { ...init, headers, body: JSON.stringify(payload) };
}

/**
 * Lets a model survive discovering that it must think.
 *
 * A model whose catalogue entry is missing `requiresReasoning` refuses every
 * call with the same 400, so retrying the same request cannot help. The refusal
 * is remembered and the request is re-sent asking for the least deliberation
 * instead of none.
 *
 * **This is a transport wrapper on purpose.** The obvious place is `invoke`, and
 * that is where it lived until 2026-08-22 — but `ChatOpenAI.withConfig` is
 * `new ChatOpenAI(this.fields)` by design (langchainjs#8586), so a replaced
 * method is dropped by the clone that `withStructuredOutput` and `bindTools`
 * build. Four structured call sites reached that clone and had no recovery at
 * all (mc2-148j9), which is the same shape of defect that cost every structured
 * call its price (mc2-258fi). `configuration.fetch` is a constructor field, so
 * it travels with the clone — and being below `invoke` it also covers `stream`
 * and `batch`, which the method wrapper never did.
 *
 * The retry is allowed once per request, not once per model: under concurrency
 * several calls to the same model are refused at once and only the first of them
 * is news, so gating on being first would leave every other in-flight request
 * re-sending the body that was just refused. A body that already carries the
 * floor falls through to ordinary error handling.
 */
export function withMandatoryReasoningRecoveryFetch(
  modelId: string,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return async function reasoningAwareFetch(input, init) {
    const response = await baseFetch(input, init);
    if (response.status !== 400) return response;

    // `clone()` so the caller still gets a readable body when this is some
    // other 400 and we hand the original back untouched.
    let said: string;
    try {
      said = await response.clone().text();
    } catch {
      return response;
    }
    if (!saysReasoningIsMandatory(said)) return response;

    const retryInit = withReasoningFloorInBody(init, modelId);
    if (!retryInit) return response;

    rememberMandatoryReasoning(modelId);
    return await baseFetch(input, retryInit);
  };
}
