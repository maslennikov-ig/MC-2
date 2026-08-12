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

-- `llm_model_config.phase_name` is a closed CHECK list, so a new phase has to be
-- admitted before it can be inserted. The list below is the one currently on the
-- database (last set by 20260528193000_add_career_playbook_department_classifier)
-- plus the proofreader. Same drop-and-recreate shape as that migration.
ALTER TABLE public.llm_model_config
DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE public.llm_model_config
ADD CONSTRAINT llm_model_config_phase_name_check
CHECK (
  phase_name = ANY (
    ARRAY[
      'global_default',
      'stage_2_summarization',
      'stage_2_standard_ru',
      'stage_2_standard_en',
      'stage_2_extended_ru',
      'stage_2_extended_en',
      'stage_3_classification',
      'stage_4_clarifying',
      'stage_4_classification',
      'stage_4_scope',
      'stage_4_expert',
      'stage_4_synthesis',
      'stage_4_standard_ru',
      'stage_4_standard_en',
      'stage_4_extended_ru',
      'stage_4_extended_en',
      'stage_5_metadata',
      'stage_5_sections',
      'stage_5_tier1',
      'stage_5_escalation',
      'stage_5_simple',
      'stage_5_normal',
      'stage_5_complex',
      'stage_5_standard_ru',
      'stage_5_standard_en',
      'stage_5_extended_ru',
      'stage_5_extended_en',
      'stage_6_judge',
      'stage_6_refinement',
      'stage_6_rag_planning',
      'stage_6_simple',
      'stage_6_normal',
      'stage_6_complex',
      'stage_6_auto_last_chance',
      'stage_6_manual_regeneration',
      'stage_6_standard_ru',
      'stage_6_standard_en',
      'stage_6_extended_ru',
      'stage_6_extended_en',
      'stage_6_arbiter',
      'stage_6_patcher',
      'stage_6_section_expander',
      'stage_6_delta_judge',
      'stage_7_cover',
      'stage_7_card',
      'stage_7_video',
      'stage_7_audio',
      'stage_7_quiz',
      'stage_7_presentation',
      'stage_7_document',
      'stage_career_playbook_department_classifier',
      'stage_career_playbook_followup',
      'stage_career_playbook_spec',
      'stage_career_playbook_group_1',
      'stage_career_playbook_group_2',
      'stage_career_playbook_group_3',
      'stage_career_playbook_group_4',
      'stage_career_playbook_group_5',
      'stage_career_playbook_group_6',
      'stage_career_playbook_judge',
      'stage_career_playbook_proofreader',
      'stage_career_playbook_regenerator',
      'chat_intent_classification',
      'chat_node_refinement',
      'chat_global_guidance',
      'chat_full_regeneration',
      'chat_stage_5_refinement',
      'chat_stage_6_refinement',
      'inline_block_regeneration',
      'inline_element_crud',
      'emergency',
      'quality_fallback'
    ]
  )
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
