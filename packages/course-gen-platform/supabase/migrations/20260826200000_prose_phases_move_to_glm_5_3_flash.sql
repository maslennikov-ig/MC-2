-- Move the Career Playbook prose phases from openai/gpt-5.6-luna to
-- z-ai/glm-5.3-flash.
--
-- Measured 2026-08-26, not assumed (mc2-r8shw). Five prose groups of one real
-- Russian playbook, run through the real runtime, artifacts read rather than
-- scored by a judge:
--
--   luna  8818 words  $0.013592     glm  6670 words  $0.006234
--   -> 54% cheaper per playbook, 39% cheaper per 1000 words, zero quality
--      issues on both sides, and no unsourced statistic on either. The one
--      figure glm added carries the product's own "(пример — заменить)" marker.
--
-- It writes about 24% less and leaves more blanks for the customer to fill.
-- That is the trade, and it is visible in the artifacts.
--
-- WHY STAGE 6 IS NOT IN THIS LIST, having been in it for one live run.
--
-- Two offline comparisons said Stage 6 should move too — one lesson at 11454
-- tokens against luna's 14817, faster, and the run's only heuristic warning was
-- luna's. A live micro course on dev disagreed, and only a live run could: all
-- 23 `stage_6_content` calls returned `finishReason: length` having spent 4819
-- of 4848 completion tokens on reasoning. Every lesson was written by the
-- escalation model instead, and the run cost $0.0949 against a usual $0.03-0.06.
--
-- The cause is arithmetic. `calculateMaxTokensForSection` sizes a section from
-- the lesson's duration — a few hundred tokens for a micro lesson — and a
-- mandatory-reasoning model then gets a flat MANDATORY_REASONING_RESERVE_TOKENS
-- (4096) added. This model's deliberation alone exceeds that reserve, so there
-- is nothing left to answer with. The offline comparison passed because it asked
-- for a flat 4000 tokens and never met the pipeline's own budget. Career
-- Playbook phases ask for 14000, which is why they are unaffected.
--
-- Stage 6 can be revisited when the reserve becomes per-model, or when the
-- deliberation itself is capped with `reasoning: {max_tokens}`.
--
-- What stays on luna for reasons unrelated to that:
--   * the judges (stage_6_judge, stage_6_delta_judge) — a verdict is not prose;
--   * every chat_* phase — interactive, and glm deliberates on every call;
--   * stage_4_*, stage_5_*, stage_2_extended_* — these produce JSON the pipeline
--     parses, and glm ignores a strict json_schema, answering with a shape of
--     its own;
--   * stage_career_playbook_spec — the skeleton the whole playbook is built
--     from, where an error is dearest and the A/B did not cover it.
--
-- The fallback stays deepseek/deepseek-v4-flash-0731: a different vendor from
-- z-ai, same rule as before. That matters more here than it did with luna,
-- because glm-5.3-flash publishes only two endpoints (z-ai and novita) against
-- glm-5.2's 36, so there is less to reroute to within the vendor.
--
-- Reasoning: these rows keep `reasoning_enabled = false`. The model refuses
-- `reasoning: {enabled: false}` with a 400 on both endpoints, and the code
-- already handles exactly that — `MODEL_CATALOG.requiresReasoning` makes both
-- the SDK and the LangChain path ask for `effort: 'low'` and grow the answer
-- budget by MANDATORY_REASONING_RESERVE_TOKENS instead of asking for none.

BEGIN;

UPDATE llm_model_config
SET model_id = 'z-ai/glm-5.3-flash',
    updated_at = NOW()
WHERE model_id = 'openai/gpt-5.6-luna'
  AND config_type = 'global'
  AND judge_role IS NULL
  AND phase_name IN (
    'stage_career_playbook_group_1',
    'stage_career_playbook_group_2',
    'stage_career_playbook_group_3',
    'stage_career_playbook_group_4',
    'stage_career_playbook_group_5',
    'stage_career_playbook_group_6',
    'stage_career_playbook_proofreader',
    'stage_career_playbook_regenerator'
  );

COMMIT;
