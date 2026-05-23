-- Route Career Playbook complex phases to DeepSeek V4 Pro.
-- Keep high-volume and short phases on V4 Flash, with V4 Pro as fallback.

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
    ('stage_career_playbook_followup', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.40, 4000, 1000000, 3, 300000),
    ('stage_career_playbook_spec', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.30, 8000, 1000000, 3, 300000),
    ('stage_career_playbook_group_1', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_2', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_3', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_4', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_5', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_6', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_judge', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.20, 4000, 1000000, 3, 300000),
    ('stage_career_playbook_regenerator', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.40, 6000, 1000000, 3, 300000)
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
    ('stage_career_playbook_followup', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.40, 4000, 1000000, 3, 300000),
    ('stage_career_playbook_spec', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.30, 8000, 1000000, 3, 300000),
    ('stage_career_playbook_group_1', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_2', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_3', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_4', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_5', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_6', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_judge', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.20, 4000, 1000000, 3, 300000),
    ('stage_career_playbook_regenerator', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.40, 6000, 1000000, 3, 300000)
)
UPDATE public.llm_model_config AS config
SET
  model_id = desired.model_id,
  fallback_model_id = desired.fallback_model_id,
  temperature = desired.temperature,
  max_tokens = desired.max_tokens,
  max_context_tokens = desired.max_context_tokens,
  max_retries = desired.max_retries,
  timeout_ms = desired.timeout_ms,
  updated_at = now()
FROM desired
WHERE config.config_type = 'global'
  AND config.phase_name = desired.phase_name
  AND config.language = 'any'
  AND config.context_tier = 'standard'
  AND config.is_active = true;
