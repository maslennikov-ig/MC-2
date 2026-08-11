-- Career Playbook quality v2: spec output budget and phase timeouts.
--
-- Two measured problems from the representative run of 2026-08-11
-- (.codex/stages/mc2-db696.105/evidence/quality-review.md):
--
-- 1. `stage_career_playbook_spec` had max_tokens 8000. The primary model returned
--    exactly 8000 output tokens - the signature of truncation - so the
--    RoleProfileSpec JSON was cut off and failed validation. The spec carries 26
--    block_boundaries entries plus focus areas, research and now the metric
--    ledger, which does not fit in 8000. Raised to 16000.
--
-- 2. Every phase had timeout_ms 300000. With up to three retries a stuck call
--    cost 15-20 minutes: the spec builder alone consumed 1,047,291 ms, a third
--    of the 56-minute run. Lowered to 120000 so three failed attempts cost six
--    minutes instead of twenty. The retry net and the size-gated judge fallback
--    routing are unchanged.
--
-- Idempotent: insert-if-missing, then converge the active global row. Same shape
-- as 20260523073000_update_career_playbook_v4_pro_routing.sql.

WITH desired(
  phase_name,
  model_id,
  fallback_model_id,
  temperature,
  max_tokens,
  max_context_tokens,
  max_retries,
  timeout_ms
) AS (
  VALUES
    ('stage_career_playbook_followup', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.40, 4000, 1000000, 3, 120000),
    ('stage_career_playbook_spec', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.30, 16000, 1000000, 3, 120000),
    ('stage_career_playbook_group_1', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_group_2', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_group_3', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_group_4', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_group_5', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_group_6', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 120000),
    ('stage_career_playbook_judge', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.20, 4000, 1000000, 3, 120000),
    ('stage_career_playbook_regenerator', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.40, 6000, 1000000, 3, 120000)
)
INSERT INTO public.llm_model_config (
  config_type,
  phase_name,
  model_id,
  fallback_model_id,
  temperature,
  max_tokens,
  max_context_tokens,
  is_active,
  language,
  context_tier,
  stage_number,
  max_retries,
  timeout_ms
)
SELECT
  'global',
  desired.phase_name,
  desired.model_id,
  desired.fallback_model_id,
  desired.temperature,
  desired.max_tokens,
  desired.max_context_tokens,
  true,
  'any',
  'standard',
  NULL::integer,
  desired.max_retries,
  desired.timeout_ms
FROM desired
WHERE NOT EXISTS (
  SELECT 1
  FROM public.llm_model_config existing
  WHERE existing.config_type = 'global'
    AND existing.phase_name = desired.phase_name
    AND existing.language = 'any'
    AND existing.context_tier = 'standard'
    AND existing.is_active = true
);

-- Converge only the two fields this migration owns. Model choice and temperature
-- stay where earlier migrations put them, so re-running this cannot silently
-- revert a later routing decision.
WITH desired(phase_name, max_tokens, timeout_ms) AS (
  VALUES
    ('stage_career_playbook_followup', 4000, 120000),
    ('stage_career_playbook_spec', 16000, 120000),
    ('stage_career_playbook_group_1', 14000, 120000),
    ('stage_career_playbook_group_2', 14000, 120000),
    ('stage_career_playbook_group_3', 14000, 120000),
    ('stage_career_playbook_group_4', 14000, 120000),
    ('stage_career_playbook_group_5', 14000, 120000),
    ('stage_career_playbook_group_6', 14000, 120000),
    ('stage_career_playbook_judge', 4000, 120000),
    ('stage_career_playbook_regenerator', 6000, 120000)
)
UPDATE public.llm_model_config AS config
SET
  max_tokens = desired.max_tokens,
  timeout_ms = desired.timeout_ms,
  updated_at = now()
FROM desired
WHERE config.config_type = 'global'
  AND config.phase_name = desired.phase_name
  AND config.language = 'any'
  AND config.context_tier = 'standard'
  AND config.is_active = true;
