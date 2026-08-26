-- Move the phases that AUTHOR prose from openai/gpt-5.6-luna to z-ai/glm-5.3-flash.
--
-- Measured 2026-08-26, not assumed (mc2-r8shw). Two paid A/B runs against the
-- live code, artifacts read rather than scored by a judge:
--
--   Career Playbook, five prose groups, one real RU playbook:
--     luna  8818 words  $0.013592     glm  6670 words  $0.006234
--     -> 54% cheaper per playbook, 39% cheaper per 1000 words, 0 quality issues
--        on both sides, no unsourced statistic on either.
--
--   Stage 6, one real lesson, introduction + two sections with Mermaid:
--     luna  14817 tokens  105.6s  duplicate-section warning: 1
--     glm   11454 tokens   85.7s  duplicate-section warning: 0
--     -> fewer tokens, faster, and the only heuristic warning was luna's.
--
-- What stays on luna, deliberately:
--   * the judges (stage_6_judge, stage_6_delta_judge) — unmeasured here, and a
--     verdict is not prose;
--   * every chat_* phase — interactive, and glm deliberates on every call;
--   * stage_4_*, stage_5_*, stage_2_extended_* — these produce JSON the pipeline
--     parses, and glm ignores a strict json_schema (it answers with a shape of
--     its own, measured on both endpoints);
--   * stage_career_playbook_spec — the skeleton the whole playbook is built
--     from, where an error is dearest and the A/B did not cover it;
--   * the two escalation hops (auto_last_chance, manual_regeneration), which
--     exist precisely to be a different bet after the normal path failed.
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
    -- Stage 6: the lesson body and the two phases that rewrite or extend it
    'stage_6_content',
    'stage_6_normal',
    'stage_6_simple',
    'stage_6_complex',
    'stage_6_refinement',
    'stage_6_section_expander',
    -- Career Playbook: the six prose groups plus the two that edit them
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
