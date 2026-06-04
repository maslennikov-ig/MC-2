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
VALUES (
  'global',
  'stage_career_playbook_department_classifier',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  0.20,
  1200,
  1000000,
  true,
  'any',
  'standard',
  NULL,
  3,
  300000
)
ON CONFLICT DO NOTHING;

UPDATE public.llm_model_config
SET
  model_id = 'deepseek/deepseek-v4-flash',
  fallback_model_id = 'deepseek/deepseek-v4-pro',
  temperature = 0.20,
  max_tokens = 1200,
  max_context_tokens = 1000000,
  max_retries = 3,
  timeout_ms = 300000,
  updated_at = now()
WHERE config_type = 'global'
  AND phase_name = 'stage_career_playbook_department_classifier'
  AND language = 'any'
  AND context_tier = 'standard'
  AND is_active = true;
