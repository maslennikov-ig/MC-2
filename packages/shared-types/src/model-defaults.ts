/**
 * Default Model Configuration
 *
 * These are LAST RESORT fallbacks when:
 * 1. Database is unavailable
 * 2. No config found for the phase
 * 3. global_default config is missing
 *
 * Primary source of truth is the database (llm_model_config table).
 * Admin can configure global_default via admin panel.
 *
 * Hierarchy:
 * 1. DB config for specific phase → primary
 * 2. DB global_default config → admin-configurable fallback
 * 3. These constants → hardcoded last resort
 */

/**
 * Default primary model (used when DB is unavailable)
 * DeepSeek V4 Flash - default fast runtime model for course generation.
 *
 * A pinned snapshot, never a `~...-latest` alias — now for two reasons rather
 * than one.
 *
 * The first is what it cost. On 2026-08-17 07:03 the alias followed its family
 * to the `-0731` snapshot with no change on our side, median latency went from
 * 8.7s to 102s, and the courses of 12-20 August failed on timeouts nobody had
 * configured. Pinned on 2026-08-21 to the snapshot the alias was already
 * resolving to, so the change froze the behaviour rather than altering it
 * (mc2-qch4w).
 *
 * The second was found on 2026-08-22 while briefly moving back to the alias:
 * `GET /models/{alias}/endpoints` answers 200 with an **empty list** — 0 against
 * 30 for this snapshot — and this codebase reads an empty list as "could not
 * find out". So an alias silently disabled the per-attempt endpoint pin, the
 * thing that hours earlier had moved two hung 238s calls onto a working
 * provider. `listModelEndpoints` now follows OpenRouter's own
 * `alias_target.slug` and that hole is closed, so an alias here would no longer
 * be unsafe — it is simply not what the owner wants. The family already carries
 * `deepseek-v4-flash-vision-exp`, experimental, at 5.5x this input price, and a
 * redirect is free to land on it.
 *
 * @see llm_model_config.model_id
 */
export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-flash-0731';

/**
 * Default fallback model (used when primary fails and DB is unavailable).
 * Deliberately a different vendor from DEFAULT_MODEL_ID so one provider
 * outage cannot take out both the primary and its fallback.
 * @see llm_model_config.fallback_model_id
 */
export const DEFAULT_FALLBACK_MODEL_ID = 'openai/gpt-5.6-luna';

/**
 * The seat for a request too large for the model that would otherwise take it,
 * and the emergency route when nothing else is reachable.
 *
 * A third vendor on purpose. This one is reached exactly when the primary and
 * its cross-vendor fallback have both failed or been outgrown, so sharing a
 * vendor with either would make the last hop the same bet as the one that just
 * lost.
 *
 * @see llm_model_config — `emergency`, and the Stage 5 context-overflow path.
 */
export const LARGE_CONTEXT_MODEL_ID = 'google/gemini-3.7-flash';

// ============================================================================
// PROSE MODEL IDS (Single Source of Truth)
// ============================================================================

/**
 * Primary model for phases that AUTHOR text the reader opens: the lesson body,
 * the expansion of a thin section, the rewrite of one that failed review.
 *
 * The two roles are deliberately the reverse of DEFAULT_*: here the careful
 * model writes and the fast one catches an outage. That is a measurement, not a
 * preference. The comparison run of 2026-08-22 (mc2-bneet) put one micro-course
 * through both models on identical settings: DeepSeek produced lessons 29%
 * shorter (11 734 characters against 16 609), taught by narration where Luna
 * taught by a worked example with real numbers, and asserted "по статистике,
 * более 60% людей..." with no source — a fabricated figure inside the artifact a
 * customer reads. Judge scores barely registered it (0.88 against 0.92), which
 * is why the repository rule is to read the artifact. The saving would have been
 * $0.008 per micro-course.
 *
 * Phases that EDIT under an explicit instruction (stage_6_patcher) or that never
 * reach the reader (arbiter, rag_planning, judges) stay on DEFAULT_MODEL_ID: a
 * surgical patch has no room to invent a statistic.
 *
 * **Changed 2026-08-26 to `z-ai/glm-5.3-flash`, on the second live run**
 * (mc2-r8shw). Two offline comparisons said it should: five Career Playbook
 * prose groups at 54% of Luna's cost with zero quality issues, and one Stage 6
 * lesson at 11454 tokens against Luna's 14817, faster, the run's only heuristic
 * warning being Luna's.
 *
 * The first live micro course contradicted them — all 23 `stage_6_content`
 * calls `finishReason: length`, 4819 of 4848 completion tokens spent on
 * reasoning, every lesson written by the escalation model, $0.0949 against a
 * usual $0.03-0.06 — and the contradiction was the container, not the model.
 * `requiresReasoning` shipped in the same commit as the routing, so dev was
 * still asking a mandatory thinker to stop thinking. Three paid probes on one
 * prompt: no reasoning field costs 1831 reasoning tokens, `effort: 'low'` costs
 * **0** and answers in full, `enabled: false` is a 400.
 *
 * The second run, after deploying: eight calls, every one `finish: stop`,
 * average 41 reasoning tokens, no escalation. Like for like on the same topic —
 * luna $0.037859 total and $0.024493 in Stage 6, glm $0.019854 and $0.005267.
 * Total 48% lower; Stage 6, which is about 90% of generation spend, 78% lower.
 * The lesson was read: a worked analogy, a valid diagram, and its one
 * statistical claim hedged rather than fabricated — the exact failure that put
 * Luna in this seat.
 *
 * It writes about 24% less than Luna. That is the trade, and it is visible in
 * the artifacts rather than inferred from a score.
 *
 * Two things this model cannot do, measured on both of its endpoints: it refuses
 * `reasoning: {enabled: false}` — which is why the catalogue entry above must
 * keep `requiresReasoning`, and why moving this constant without deploying the
 * catalogue is how the first run went wrong — and it ignores a strict
 * `json_schema`, answering with a shape of its own. Anything that parses the
 * answer stays where it was.
 *
 * @see llm_model_config.model_id — the database still wins at runtime.
 */
export const PROSE_MODEL_ID = 'z-ai/glm-5.3-flash';

/** Fallback for authoring phases — a different vendor, same rule as DEFAULT_*. */
export const PROSE_FALLBACK_MODEL_ID = DEFAULT_MODEL_ID;

// ============================================================================
// CHAT MODEL IDS (Single Source of Truth)
// ============================================================================

/** Primary chat model — used for chat_node_refinement, chat_global_guidance, etc. */
export const CHAT_PRIMARY_MODEL_ID = DEFAULT_FALLBACK_MODEL_ID;

/** Fallback chat model — different vendor from the primary, see DEFAULT_FALLBACK_MODEL_ID */
export const CHAT_FALLBACK_MODEL_ID = DEFAULT_MODEL_ID;

/** Stage 6 chat primary model — used for chat_stage_6_refinement */
export const CHAT_STAGE6_PRIMARY_MODEL_ID = DEFAULT_MODEL_ID;

/** Stage 6 chat fallback model — same as DEFAULT_FALLBACK_MODEL_ID */
export const CHAT_STAGE6_FALLBACK_MODEL_ID = DEFAULT_FALLBACK_MODEL_ID;

// ============================================================================
// LEGACY
// ============================================================================

/**
 * Legacy model aliases mapped to current replacement IDs.
 * @deprecated These should not be used in new code
 */
export const LEGACY_MODEL_IDS = {
  OSS_20B: 'openai/gpt-oss-20b',
  OSS_120B: DEFAULT_MODEL_ID,
} as const;

/**
 * Phase name for global default configuration in database
 */
export const GLOBAL_DEFAULT_PHASE = 'global_default';

/**
 * Model configuration defaults
 */
export const MODEL_DEFAULTS = {
  temperature: 0.3,
  maxTokens: 16384,
  maxRetries: 3,
  timeoutMs: 120000,
} as const;
