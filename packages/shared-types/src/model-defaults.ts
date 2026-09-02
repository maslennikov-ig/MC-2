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
 * One correction to the headline, made 2026-08-27 against a month of real
 * courses. The 78% belongs to `stage_6_content` and `stage_6_section_expander`;
 * `stage_6_refinement` is not part of it. Refinement is the largest Stage 6
 * phase by tokens — 535k in the month to 2026-08-26 — and most of it had been
 * running on deepseek at $0.064 per 1M tokens against this model's measured
 * $0.074. So moving refinement here bought better prose at the same price, not
 * a saving, and saying otherwise would credit this change with money it did not
 * find.
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

/**
 * Fallback for authoring phases. A different vendor, same rule as DEFAULT_* —
 * but **not** `DEFAULT_MODEL_ID`, which is what it was until 2026-08-28.
 *
 * The cross-vendor rule was satisfied and the point was still missed. DeepSeek
 * is not merely "the other model" for prose: it is the model this seat was taken
 * away from, and for a specific fault. The comparison of 2026-08-22 (mc2-bneet)
 * had it assert "по статистике, более 60% людей..." with no source — a
 * fabricated figure inside the artifact a customer reads — while judge scores
 * barely registered the difference (0.88 against 0.92).
 *
 * So a z-ai outage handed every lesson back to the model rejected for writing
 * lessons, silently, and the judge that missed it the first time would have
 * missed it again. Luna is the third vendor, was itself the prose model until
 * 2026-08-26, and is already the primary on eleven other phases. It costs more
 * per output token than DeepSeek, which is the price of a fallback being a
 * fallback rather than a downgrade — and it is reached only when the primary
 * fails (mc2-u8kwx).
 *
 * The `stage_6_content` seat has no database row of its own and is served from
 * `STAGE6_CANONICAL_PHASE_DEFAULTS`, so this constant is the whole decision
 * there; the other seventeen prose rows were updated to match.
 */
export const PROSE_FALLBACK_MODEL_ID = DEFAULT_FALLBACK_MODEL_ID;

// ============================================================================
// ESCALATION
// ============================================================================

/**
 * The model asked after the ordinary one has already failed on this work.
 *
 * A role, not a preference, and the reason it is neither `DEFAULT_MODEL_ID` nor
 * `PROSE_MODEL_ID`: by the time an escalation runs, the model that would
 * otherwise take the job has just produced something a judge rejected or a
 * parser could not read. Retrying it is a wasted attempt, so this seat is held
 * by the most capable model in the catalogue rather than the cheapest — at
 * $1.19/$3.74 per 1M it costs roughly twenty times `DEFAULT_MODEL_ID`, which is
 * affordable precisely because it is reached rarely.
 *
 * Named on 2026-08-28. It was spelt out twice in `stage6-model-config.ts` and
 * was the last literal `model-ids-live-in-one-place` had to grandfather: the
 * role had no name, so the guard could not tell a declaration from a copy
 * (mc2-u8kwx).
 *
 * @see llm_model_config — `stage_6_auto_last_chance`, `stage_6_manual_regeneration`.
 */
export const ESCALATION_MODEL_ID = 'z-ai/glm-5.2';

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
