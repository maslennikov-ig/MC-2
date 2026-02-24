-- Migration: Stage 5 3-tier model routing
-- Renames phase names: stage_5_tier1 → stage_5_simple, stage_5_sections → stage_5_normal
-- Adds new phase: stage_5_complex (premium tier for hardest sections + first section)
--
-- Model routing:
--   simple  → openai/gpt-oss-120b      (cheap, trivial sections)
--   normal  → xiaomi/mimo-v2-flash      (main workhorse, majority of content)
--   complex → moonshotai/kimi-k2-0905   (premium, complex + first section)

-- Step 1: Drop old constraint
ALTER TABLE llm_model_config DROP CONSTRAINT llm_model_config_phase_name_check;

-- Step 2: Rename phases FIRST (while no constraint)
UPDATE llm_model_config SET phase_name = 'stage_5_simple' WHERE phase_name = 'stage_5_tier1';
UPDATE llm_model_config SET phase_name = 'stage_5_normal' WHERE phase_name = 'stage_5_sections';

-- Step 3: Add updated constraint with new phase names
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
  phase_name = ANY (ARRAY[
    'chat_full_regeneration', 'chat_global_guidance', 'chat_node_refinement',
    'emergency', 'global_default', 'quality_fallback',
    'stage_2_summarization', 'stage_3_classification',
    'stage_4_clarifying', 'stage_4_classification', 'stage_4_expert', 'stage_4_scope', 'stage_4_synthesis',
    'stage_5_escalation', 'stage_5_metadata',
    'stage_5_simple', 'stage_5_normal', 'stage_5_complex',
    'stage_6_arbiter', 'stage_6_delta_judge', 'stage_6_judge',
    'stage_6_patcher', 'stage_6_rag_planning', 'stage_6_refinement', 'stage_6_section_expander',
    'stage_7_audio', 'stage_7_card', 'stage_7_cover', 'stage_7_presentation', 'stage_7_quiz', 'stage_7_video',
    'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'phase_6_rag_planning'
  ])
);

-- Step 4: Update simple tier models
UPDATE llm_model_config
SET model_id = 'openai/gpt-oss-120b', fallback_model_id = 'xiaomi/mimo-v2-flash'
WHERE phase_name = 'stage_5_simple' AND context_tier = 'standard';

UPDATE llm_model_config
SET model_id = 'google/gemini-2.5-flash', fallback_model_id = 'openai/gpt-oss-120b'
WHERE phase_name = 'stage_5_simple' AND context_tier = 'extended';

-- Step 5: Update normal tier models
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash', fallback_model_id = 'google/gemini-2.5-flash'
WHERE phase_name = 'stage_5_normal' AND context_tier = 'standard';

UPDATE llm_model_config
SET model_id = 'google/gemini-2.5-flash', fallback_model_id = 'xiaomi/mimo-v2-flash'
WHERE phase_name = 'stage_5_normal' AND context_tier = 'extended';

-- Step 6: Insert complex tier (premium)
INSERT INTO llm_model_config (config_type, phase_name, model_id, fallback_model_id, temperature, max_tokens, is_active, language, context_tier, stage_number)
VALUES
  ('global', 'stage_5_complex', 'moonshotai/kimi-k2-0905', 'google/gemini-2.5-flash', 0.70, 30000, true, 'any', 'standard', 5),
  ('global', 'stage_5_complex', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-0905', 0.70, 30000, true, 'any', 'extended', 5);
