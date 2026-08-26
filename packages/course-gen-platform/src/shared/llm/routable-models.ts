/**
 * Every model this code can route a paid call to.
 *
 * `LIVE_ROUTING_MODEL_IDS` is seven ids typed by hand, and the drift gate
 * re-read only those against the published rates. Over the sixty days to
 * 2026-08-25 `generation_trace` held **eleven** distinct model ids: six ran on
 * frozen, unverified prices, and two of those were drifted at the moment of
 * reading. They were not scripts — `stage_6_refinement` ran on `qwen/qwen3.7-plus`,
 * `z-ai/glm-5` and `minimax/minimax-m2.1` on 2026-08-22, and
 * `moonshotai/kimi-k2-thinking` served `stage_4_clarifying` (mc2-a6qxc).
 *
 * A hand-written list of what production routes to is a second copy of a fact
 * the code already states, and the copy is the one that goes stale. So this
 * derives the set from the registries themselves. A new fallback, a new
 * escalation tier or a new rename lands in the gate by being written, not by
 * somebody remembering to add its name here as well.
 *
 * Why it still matters now that the ledger records the charge OpenRouter states
 * (mc2-skwm3): the catalogue stopped being the source of the reported cost, but
 * it is still the source of `provider.max_price`. A ceiling built from a stale
 * rate that sits under every endpoint is answered with `No endpoints found that
 * satisfy the max price for this request` — a hard refusal, not a cheaper route.
 * One wrong number can fail every call to a model.
 *
 * @module shared/llm/routable-models
 */

import {
  CHAT_FALLBACK_MODEL_ID,
  CHAT_PRIMARY_MODEL_ID,
  CHAT_STAGE6_FALLBACK_MODEL_ID,
  CHAT_STAGE6_PRIMARY_MODEL_ID,
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_MODEL_ID,
  LARGE_CONTEXT_MODEL_ID,
  LIVE_ROUTING_MODEL_IDS,
  PROSE_FALLBACK_MODEL_ID,
  PROSE_MODEL_ID,
  normalizeModelId,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

import { MODEL_FALLBACK } from '@/stages/stage6-lesson-content/config';
import { MERMAID_REPAIR_MODEL_IDS } from '@/stages/stage6-lesson-content/utils/mermaid-llm-fixer';

import {
  COLLISION_FALLBACK_MODEL_ID,
  DEFAULT_PHASE_CONFIGS,
  RETIRED_MODEL_ID_REPLACEMENTS,
} from './model-config-db';
import { PHASE_FALLBACK_CONFIG } from './phase-fallback-config';
import { MODELS } from './model-selector';

/** One registry that can put a model on the wire, and what it holds. */
export interface RoutableModelSource {
  /** Where to look when an id here turns out to be wrong. */
  source: string;
  modelIds: string[];
}

/**
 * The registries, named, so a drift report can say who routes to the model it
 * is complaining about.
 *
 * Every entry is read from the module that owns it. Nothing here restates an
 * id, because a restated id is the failure this file exists to end.
 */
export function collectRoutableModelSources(): RoutableModelSource[] {
  return [
    {
      source: 'shared-types/model-catalog.ts LIVE_ROUTING_MODEL_IDS',
      modelIds: [...LIVE_ROUTING_MODEL_IDS],
    },
    {
      source: 'shared-types/model-defaults.ts',
      modelIds: [
        DEFAULT_MODEL_ID,
        DEFAULT_FALLBACK_MODEL_ID,
        LARGE_CONTEXT_MODEL_ID,
        PROSE_MODEL_ID,
        PROSE_FALLBACK_MODEL_ID,
        CHAT_PRIMARY_MODEL_ID,
        CHAT_FALLBACK_MODEL_ID,
        CHAT_STAGE6_PRIMARY_MODEL_ID,
        CHAT_STAGE6_FALLBACK_MODEL_ID,
      ],
    },
    {
      source: 'shared/llm/phase-fallback-config.ts PHASE_FALLBACK_CONFIG',
      modelIds: Object.values(PHASE_FALLBACK_CONFIG).map(config => config.modelId),
    },
    {
      source: 'shared-types/stage6-model-config.ts STAGE6_CANONICAL_PHASE_DEFAULTS',
      modelIds: Object.values(STAGE6_CANONICAL_PHASE_DEFAULTS).flatMap(config => [
        config.modelId,
        config.fallbackModelId,
      ]),
    },
    {
      source: 'shared/llm/model-selector.ts MODELS',
      modelIds: Object.values(MODELS).map(model => model.modelId),
    },
    {
      // The replacements, not the retired ids: a retired id never reaches the
      // provider, the id it is rewritten to does.
      source: 'shared/llm/model-config-db.ts RETIRED_MODEL_ID_REPLACEMENTS',
      modelIds: [...Object.values(RETIRED_MODEL_ID_REPLACEMENTS), COLLISION_FALLBACK_MODEL_ID],
    },
    {
      // The committed snapshot of `llm_model_config`, which is what runs when
      // the database lookup misses.
      source: 'config/config-seed.json',
      modelIds: Object.values(DEFAULT_PHASE_CONFIGS).flatMap(config =>
        [config.modelId, config.fallbackModelId].filter(
          (id): id is string => typeof id === 'string'
        )
      ),
    },
    {
      source: 'stages/stage6-lesson-content escalation tiers',
      modelIds: [MODEL_FALLBACK.fallback, ...MERMAID_REPAIR_MODEL_IDS],
    },
  ];
}

/**
 * Every id the code can route to, deduplicated, exactly as declared.
 *
 * Deliberately **not** normalized. `normalizeModelId` exists for the id a
 * provider answers with — `openai/gpt-5.6-luna-20260709` for a request naming
 * `openai/gpt-5.6-luna` — and it strips any trailing run of four to eight
 * digits. Applied to a declared id that is spelt that way, it destroys it:
 * `qwen/qwen3-235b-a22b-2507` is a catalogue key in its own right, and
 * normalizing turns it into `qwen/qwen3-235b-a22b`, which is nothing at all.
 * A gate built on that would have reported a priced model as unpriced and sent
 * somebody to add a duplicate entry for it.
 *
 * Lookups do their own normalizing anyway: `getModelCapabilities` tries the
 * exact id first and the normalized form second, so both spellings resolve.
 */
export function collectRoutableModelIds(): string[] {
  return [
    ...new Set(
      collectRoutableModelSources()
        .flatMap(source => source.modelIds)
        .filter(modelId => modelId.length > 0)
    ),
  ].sort();
}

/**
 * Which registries route to this model, so a drift report can name the file to
 * open rather than only the id that is wrong.
 *
 * Matched through `normalizeModelId` on both sides, because here the question is
 * "is this the same model", and a served snapshot should find the entry that
 * declared it.
 */
export function describeRoutableModel(modelId: string): string[] {
  const normalized = normalizeModelId(modelId);
  return collectRoutableModelSources()
    .filter(source =>
      source.modelIds.some(id => id === modelId || normalizeModelId(id) === normalized)
    )
    .map(source => source.source);
}
