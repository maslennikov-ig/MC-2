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
      'stage_career_playbook_followup',
      'stage_career_playbook_spec',
      'stage_career_playbook_group_1',
      'stage_career_playbook_group_2',
      'stage_career_playbook_group_3',
      'stage_career_playbook_group_4',
      'stage_career_playbook_group_5',
      'stage_career_playbook_group_6',
      'stage_career_playbook_judge',
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
SELECT v.*
FROM (
  VALUES
    ('global', 'stage_career_playbook_followup', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.40, 4000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_spec', 'minimax/minimax-m2.7', 'deepseek/deepseek-v4-flash', 0.30, 8000, 205000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_1', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_2', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_3', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_4', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_5', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_group_6', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_judge', 'minimax/minimax-m2.7', 'deepseek/deepseek-v4-flash', 0.20, 4000, 205000, true, 'any', 'standard', NULL::integer, 3, 300000),
    ('global', 'stage_career_playbook_regenerator', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.40, 6000, 1000000, true, 'any', 'standard', NULL::integer, 3, 300000)
) AS v(config_type, phase_name, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active, language, context_tier, stage_number, max_retries, timeout_ms)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.llm_model_config m
  WHERE m.config_type = v.config_type
    AND m.phase_name = v.phase_name
    AND m.language = v.language
    AND m.context_tier = v.context_tier
    AND m.is_active = true
);

UPDATE public.llm_model_config AS m
SET
  model_id = v.model_id,
  fallback_model_id = v.fallback_model_id,
  temperature = v.temperature,
  max_tokens = v.max_tokens,
  max_context_tokens = v.max_context_tokens,
  max_retries = v.max_retries,
  timeout_ms = v.timeout_ms
FROM (
  VALUES
    ('stage_career_playbook_followup', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.40, 4000, 1000000, 3, 300000),
    ('stage_career_playbook_spec', 'minimax/minimax-m2.7', 'deepseek/deepseek-v4-flash', 0.30, 8000, 205000, 3, 300000),
    ('stage_career_playbook_group_1', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_2', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_3', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_4', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_5', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_group_6', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.70, 14000, 1000000, 3, 300000),
    ('stage_career_playbook_judge', 'minimax/minimax-m2.7', 'deepseek/deepseek-v4-flash', 0.20, 4000, 205000, 3, 300000),
    ('stage_career_playbook_regenerator', 'deepseek/deepseek-v4-flash', 'minimax/minimax-m2.7', 0.40, 6000, 1000000, 3, 300000)
) AS v(phase_name, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, max_retries, timeout_ms)
WHERE m.config_type = 'global'
  AND m.phase_name = v.phase_name
  AND m.language = 'any'
  AND m.context_tier = 'standard'
  AND m.is_active = true;
