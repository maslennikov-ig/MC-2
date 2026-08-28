/**
 * Model ids that are no longer served, and what to ask for instead.
 *
 * Here rather than in the platform package because two places rewrite a retired
 * id and both must rewrite it the same way: `model-config-db.ts` when a row is
 * read at runtime, and `generate-config-seed.ts` when the seed is refreshed from
 * the database. Until 2026-08-28 the seed generator carried its own copy with
 * three of these eight entries, so five retired ids survived a seed refresh and
 * only the runtime map caught them (mc2-u8kwx).
 *
 * Every replacement must itself be in `LIVE_ROUTING_MODEL_IDS`, which is
 * stronger than "in the catalogue" and stronger than it was. An uncatalogued
 * replacement trades a known-retired id for an unknown one: cost resolves to the
 * pessimistic $1/$3 default and both capability predicates answer "unknown",
 * which reads as "no reasoning, temperature accepted" whether or not that is
 * true — `openai/gpt-5.4` pointed at `google/gemini-3.5-flash`, in no catalogue
 * here. But a *catalogued* replacement outside live routing is not much better:
 * `qwen/qwen3.5-plus-02-15` pointed at `qwen/qwen3.7-plus`, which was the last
 * model reachable from nowhere else, so retiring an id quietly kept an
 * eleventh model on the wire. It goes to `DEFAULT_FALLBACK_MODEL_ID`, cheaper
 * on both legs ($0.20/$1.20 against $0.32/$1.28) and gated like everything
 * else.
 *
 * @module retired-model-ids
 */

import {
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_MODEL_ID,
  LARGE_CONTEXT_MODEL_ID,
} from './model-defaults';

/** Retired id → the id to ask for instead. */
export const RETIRED_MODEL_ID_REPLACEMENTS: Record<string, string> = {
  'xiaomi/mimo-v2-flash': DEFAULT_MODEL_ID,
  'x-ai/grok-4.1-fast': DEFAULT_MODEL_ID,
  'x-ai/grok-4-fast': DEFAULT_MODEL_ID,
  'qwen/qwen3.5-plus-02-15': DEFAULT_FALLBACK_MODEL_ID,
  'deepseek/deepseek-v3.2': DEFAULT_MODEL_ID,
  'openai/gpt-5.4': LARGE_CONTEXT_MODEL_ID,
  'minimax/minimax-m2.5': 'minimax/minimax-m3',
  'openai/gpt-oss-120b': DEFAULT_MODEL_ID,
};

/**
 * Substituted when a row's fallback resolves to its own primary, so the rescue
 * model is never the model being rescued.
 *
 * Must be a live-routed model. It was `qwen/qwen3-235b-a22b-2507`, which the
 * 2026-08-12 routing cut retired, and which carries the smallest output ceiling
 * in the catalogue at 16384 — the exact ceiling recorded in
 * `pipeline-admin/model-budget-validation.ts` as having already refused
 * `stage_5_escalation`'s 30000-token budget. A collision on any generous phase
 * would have landed there.
 */
export const COLLISION_FALLBACK_MODEL_ID = LARGE_CONTEXT_MODEL_ID;
