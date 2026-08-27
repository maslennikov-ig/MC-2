/**
 * Which OpenAI/Google service tier a phase is allowed to be served by.
 *
 * OpenRouter lists tier variants of a model as ordinary endpoints with their own
 * tags — `openai/flex` at half the default rate, `openai/priority` at double —
 * and they arrive in the same `/endpoints` list everything else does. Measured
 * live on 2026-08-25: the same 14-token prompt cost $0.000004356 pinned to
 * `openai/flex` against $0.000008712 unpinned, and the response body reported
 * `service_tier: "flex"` and `"default"` respectively. So the discount is real
 * and it is a routing decision, not a model change.
 *
 * That is also the danger. `pickCheapestUntriedEndpoint` sorts by live price and
 * pins the cheapest, so the moment OpenRouter published these tags the whole
 * pipeline was one prod run away from silently moving to flex — including the
 * chat box a human is watching. Flex, unlike priority, does not fall back to a
 * default endpoint when capacity is short: it refuses, and the caller wears the
 * retry. That trade is right for a background lesson and wrong for a person
 * waiting on an answer, which is a decision somebody has to make rather than
 * inherit from a sort order.
 *
 * So the tier is chosen here, from the phase, and the endpoint picker is told
 * what it may use.
 *
 * Refs mc2-a9w19
 *
 * @module shared/llm/service-tier
 */

import type { PhaseName } from '@megacampus/shared-types/model-config';

import logger from '../logger';

/**
 * The tiers we route to.
 *
 * `priority` exists and costs twice the default rate for lower latency. It is
 * deliberately not here: nothing in this pipeline is worth double to answer
 * faster, and a tier that can only be reached by naming it cannot be reached by
 * accident.
 */
export type ServiceTier = 'default' | 'flex';

/**
 * Phases where a person is waiting for the answer.
 *
 * The list is of the interactive phases rather than the background ones because
 * interactive work is the small, enumerable half: everything the pipeline does
 * on its own is background by definition, and a new background phase should get
 * the cheap tier without anyone remembering to add it.
 */
const INTERACTIVE_PHASE_NAMES: readonly PhaseName[] = [
  // The chat box, in every one of its forms.
  'chat_intent_classification',
  'chat_node_refinement',
  'chat_global_guidance',
  'chat_full_regeneration',
  'chat_stage_5_refinement',
  'chat_stage_6_refinement',
  // Editing one block or one element, with the editor open.
  'inline_block_regeneration',
  'inline_element_crud',
  // The clarifying questions are the wizard's next screen, not a background step.
  'stage_4_clarifying',
];

/**
 * Career Playbook's interactive phases.
 *
 * Separate because `PhaseName` does not carry them: the playbook phases live in
 * `llm_model_config` and are resolved by name at runtime, so the union in
 * `model-config.ts` has never listed them. Only the two that run inside the
 * wizard are here — the six `group_*` phases and `spec` run after the user has
 * submitted and are background work.
 */
const INTERACTIVE_PLAYBOOK_PHASES: readonly string[] = [
  'stage_career_playbook_department_classifier',
  'stage_career_playbook_followup',
];

/** Every phase that must not be served by a tier that can refuse for capacity. */
export const LATENCY_SENSITIVE_PHASES: ReadonlySet<string> = new Set<string>([
  ...INTERACTIVE_PHASE_NAMES,
  ...INTERACTIVE_PLAYBOOK_PHASES,
]);

/**
 * The cheapest tier this phase may be served by.
 *
 * An unknown phase gets `default`, and so does a call that never said which
 * phase it belongs to. `LLMClientOptions.costContext` is optional by design —
 * plenty of call sites do not know the course — and a missing field must not be
 * able to change what a call costs or how it fails.
 */
export function resolveServiceTier(phase: string | undefined): ServiceTier {
  if (!phase) return 'default';
  return LATENCY_SENSITIVE_PHASES.has(phase) ? 'default' : 'flex';
}

/**
 * The statuses a provider uses to say "not at this tier, not right now".
 *
 * OpenRouter documents the behaviour without documenting a code: flex "never
 * falls back to a default-tier endpoint, since that would cost more than the
 * tier you requested, so a flex capacity error surfaces instead". Upstream that
 * is OpenAI's `resource_unavailable`, which arrives as a 429, and a tier with no
 * capacity is equally entitled to answer 503.
 */
const FLEX_REFUSAL_STATUSES = new Set([429, 503]);

/**
 * Re-send a request that asked for flex, at the ordinary tariff.
 *
 * The LangChain path names the tier with `service_tier` rather than by pinning
 * an endpoint tag, because it has no endpoint list to pin from. That buys
 * simplicity and gives up the thing the SDK path gets for free: there, a flex
 * endpoint that refuses simply loses its attempt and the chain's next attempt
 * takes the next cheapest endpoint, which is the default-tier one. Here nothing
 * would take that step, and the largest cost line in the pipeline — Stage 6
 * lesson generation — runs on this path.
 *
 * So the fallback is the transport's, for the same reason
 * {@link withMandatoryReasoningRecoveryFetch} is a transport wrapper rather than
 * an `invoke` override: `ChatOpenAI.withConfig` rebuilds the instance from its
 * constructor fields, so anything attached afterwards is dropped by the clone
 * `withStructuredOutput` builds (langchainjs#8586).
 *
 * The retry only ever removes a discount. Worst case — an ordinary rate limit
 * misread as a capacity refusal — it costs the default tariff for one call,
 * which is what the call would have cost anyway before any of this. It is
 * allowed once per request, and only for a request that actually asked for flex.
 */
export function withFlexCapacityFallbackFetch(
  modelId: string,
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return async function flexAwareFetch(input, init) {
    const response = await baseFetch(input, init);
    if (!FLEX_REFUSAL_STATUSES.has(response.status)) return response;

    const retryInit = withoutServiceTier(init);
    if (!retryInit) return response;

    logger.warn(
      { modelId, status: response.status },
      '[Routing] The flex tier refused this request; re-sending it at the default tariff'
    );
    return await baseFetch(input, retryInit);
  };
}

/**
 * Strip `service_tier` from a request body that was just refused.
 *
 * `undefined` when there is nothing to retry: a body that is not JSON, or one
 * that never asked for a tier in the first place — that refusal is somebody
 * else's problem and must reach the caller unchanged.
 */
function withoutServiceTier(init: RequestInit | undefined): RequestInit | undefined {
  const body = init?.body;
  if (typeof body !== 'string') return undefined;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object' || payload.service_tier === undefined) {
    return undefined;
  }

  delete payload.service_tier;

  // A stale `content-length` would describe the body that was refused.
  const headers = new Headers(init?.headers);
  headers.delete('content-length');

  return { ...init, headers, body: JSON.stringify(payload) };
}
