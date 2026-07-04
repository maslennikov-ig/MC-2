-- Promote the Career Playbook cross-block judge to DeepSeek V4 Flash primary
-- with V4 Pro fallback (mc2-m17al), replacing the dev-only
-- CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES compose override used for the A/B.
--
-- Evidence (dev A/B runs b866d2f5 + e12a46ad): flash handled every judge call
-- that fit its practical input window; the two historical 300s flash timeouts
-- were the ~31.5k-token final full-document judge, now bounded by delta
-- re-judge (inputs <= ~21k) and covered by the size-gated fallback-first
-- routing (CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD, default 28000),
-- which requires fallback_model_id to be the pro model.
--
-- The regenerator deliberately stays on V4 Pro (flash risks worse convergence
-- and more cap-exhaustion criterion-#1 leaks; needs its own quality A/B).
-- Idempotent: insert-if-missing, then converge the active global row.

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
    ('stage_career_playbook_judge', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.20, 4000, 1000000, 3, 300000)
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
    ('stage_career_playbook_judge', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-pro', 0.20, 4000, 1000000, 3, 300000)
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
