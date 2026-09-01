-- The whole-document proofreader joins the judge it is a sibling of.
--
-- `stage_career_playbook_proofreader` has run `z-ai/glm-5.3-flash` since
-- 20260826200000_prose_phases_move_to_glm_5_3_flash.sql, which moved the Career
-- Playbook PROSE phases there on a measured 54%-cheaper A/B. That migration also
-- wrote down, in the same comment, the rule this row breaks:
--
--   * the judges (stage_6_judge, stage_6_delta_judge) — a verdict is not prose;
--   * stage_4_*, stage_5_*, stage_2_extended_* — these produce JSON the pipeline
--     parses, and glm ignores a strict json_schema, answering with a shape of
--     its own;
--
-- The proofreader is both of those things. It writes no sentence the reader ever
-- opens: it reads the assembled guide and returns a
-- `CareerPlaybookJudgeVerdict` — the same type, the same taxonomy and the same
-- regeneration path as `stage_career_playbook_judge`, which stayed on
-- `deepseek/deepseek-v4-flash-0731` throughout. It was swept into the prose list
-- by its name.
--
-- The cost of that grouping came due on 2026-09-01, when the pass began asking
-- for its verdict as a schema rather than as prose (mc2-w2lj4). Run db9d3ff9 had
-- already lost the whole pass three times to a Russian block title quoted inside
-- a JSON string.
--
-- Cheaper as well as more consistent, on this call's real shape — 29.3k prompt
-- tokens in, ~2k of findings out, over the endpoints that accept a schema and
-- clear the throughput floor:
--
--   deepseek/deepseek-v4-flash-0731  baidu/fp8  $0.050/$0.100 per 1M  ~$0.00166
--   z-ai/glm-5.3-flash               makora     $0.140/$0.470 per 1M  ~$0.00504
--
-- glm's own cheapest endpoints at $0.075/M are not in that comparison: three of
-- the four do not accept a schema at all.
--
-- The fallback stays `openai/gpt-5.6-luna` — a third vendor, unchanged by this,
-- and still the different bet that 20260828090000 made it.

BEGIN;

UPDATE llm_model_config
SET model_id = 'deepseek/deepseek-v4-flash-0731',
    primary_display_name = 'DeepSeek V4 Flash 0731',
    updated_at = NOW()
WHERE config_type = 'global'
  AND judge_role IS NULL
  AND is_active
  AND phase_name = 'stage_career_playbook_proofreader'
  AND model_id = 'z-ai/glm-5.3-flash';

COMMIT;
