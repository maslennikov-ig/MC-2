-- Career Playbook: model routing for the whole-document proofreading pass.
--
-- The pass reads the fully assembled guide (~30k input tokens) and reports the
-- defects a group-sized window cannot see. The 2026-08-11 editorial read found
-- six of them in output that the deterministic scorecard called clean, the
-- clearest being hiring authority stated three different ways across blocks 5,
-- 16 and 24 - three blocks in three groups, with no reviewer that saw all three.
--
-- Routed to V4 Pro because the judgement is semantic, and given a 240s timeout
-- because the input is large; output is a short verdict, so max_tokens stays at
-- 4000. The owner removed the latency budget in favour of quality, which is why
-- this phase exists at all.
--
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
    ('stage_career_playbook_proofreader', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 0.20, 4000, 1000000, 2, 240000)
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

WITH desired(phase_name, model_id, fallback_model_id, max_tokens, timeout_ms) AS (
  VALUES
    ('stage_career_playbook_proofreader', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 4000, 240000)
)
UPDATE public.llm_model_config AS config
SET
  model_id = desired.model_id,
  fallback_model_id = desired.fallback_model_id,
  max_tokens = desired.max_tokens,
  timeout_ms = desired.timeout_ms,
  updated_at = now()
FROM desired
WHERE config.config_type = 'global'
  AND config.phase_name = desired.phase_name
  AND config.language = 'any'
  AND config.context_tier = 'standard'
  AND config.is_active = true;
