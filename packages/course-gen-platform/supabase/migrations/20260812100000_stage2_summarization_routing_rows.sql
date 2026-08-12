-- Stage 2 summarization: give the four live phases the database rows they never had.
--
-- `phase-6-summarization.ts` builds its phase name at runtime as
-- `stage_2_${tier}_${language}`, so the live names are stage_2_standard_ru,
-- stage_2_standard_en, stage_2_extended_ru and stage_2_extended_en. None of the
-- four has ever existed in `llm_model_config`. A read-only probe against the
-- deployed dev API on 2026-08-12 resolved all four with `source: "hardcoded"`
-- and logged "Using HARDCODED fallback config - database unavailable and no
-- cache" — while the database was perfectly reachable. The message is about a
-- missing row, not a missing database, which is how this stayed invisible.
--
-- Two consequences, both silent: Stage 2 ran on whatever was frozen into the
-- committed `src/config/config-seed.json`, and the pipeline-admin screen could
-- not change Stage 2 routing at all, because its edits go to a table nothing
-- read for these phases.
--
-- The values below are exactly the ones the seed was already serving, so this
-- migration changes no behaviour. It only moves the source of truth to where
-- the code looks first. Revising the models themselves is a separate decision.
--
-- language 'any' and context_tier 'standard' are deliberate: both call sites
-- invoke getModelForPhase(phaseName) with no tokenCount and no language, and
-- the service then looks up language 'any' at tier 'standard'. The tier and
-- language are already carried by the phase name.
--
-- Idempotent: insert-if-missing only. It will not overwrite a row an operator
-- has since tuned.

INSERT INTO public.llm_model_config (
  config_type,
  phase_name,
  model_id,
  fallback_model_id,
  temperature,
  max_tokens,
  max_context_tokens,
  quality_threshold,
  is_active,
  language,
  context_tier,
  stage_number,
  max_retries
)
SELECT
  'global',
  desired.phase_name,
  desired.model_id,
  desired.fallback_model_id,
  desired.temperature,
  desired.max_tokens,
  desired.max_context_tokens,
  desired.quality_threshold,
  true,
  'any',
  'standard',
  2,
  3
FROM (
  VALUES
    ('stage_2_standard_ru', 'deepseek/deepseek-v4-flash', 'qwen/qwen3-235b-a22b-2507', 0.70, 4096, 128000, 0.75),
    ('stage_2_standard_en', 'deepseek/deepseek-v4-flash', 'qwen/qwen3-235b-a22b-2507', 0.70, 4096, 128000, 0.75),
    ('stage_2_extended_ru', 'google/gemini-3-flash-preview', 'deepseek/deepseek-v4-flash', 0.70, 8192, 128000, 0.75),
    ('stage_2_extended_en', 'google/gemini-3-flash-preview', 'deepseek/deepseek-v4-flash', 0.70, 8192, 128000, 0.75)
) AS desired(
  phase_name,
  model_id,
  fallback_model_id,
  temperature,
  max_tokens,
  max_context_tokens,
  quality_threshold
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.llm_model_config existing
  WHERE existing.config_type = 'global'
    AND existing.phase_name = desired.phase_name
    AND existing.language = 'any'
    AND existing.context_tier = 'standard'
    AND existing.is_active = true
);
