-- Migration: Update Stage 6 CLEV judge and delta judge models
-- Primary: minimax-m2.5, Secondary: glm-5, Tiebreaker: qwen3.5-plus, Delta: qwen3.5-plus
-- Date: 2026-02-17

-- Primary judges → minimax/minimax-m2.5
UPDATE llm_model_config
SET model_id = 'minimax/minimax-m2.5',
    weight = 0.76,
    primary_display_name = 'Minimax M2.5'
WHERE phase_name = 'stage_6_judge'
  AND judge_role = 'primary'
  AND is_active = true;

-- Secondary judges → z-ai/glm-5
UPDATE llm_model_config
SET model_id = 'z-ai/glm-5',
    weight = 0.74,
    primary_display_name = 'GLM-5'
WHERE phase_name = 'stage_6_judge'
  AND judge_role = 'secondary'
  AND is_active = true;

-- Tiebreaker → qwen/qwen3.5-plus-02-15
UPDATE llm_model_config
SET model_id = 'qwen/qwen3.5-plus-02-15',
    weight = 0.75,
    primary_display_name = 'Qwen3.5 Plus'
WHERE phase_name = 'stage_6_judge'
  AND judge_role = 'tiebreaker'
  AND is_active = true;

-- Delta judge → qwen/qwen3.5-plus-02-15
UPDATE llm_model_config
SET model_id = 'qwen/qwen3.5-plus-02-15',
    primary_display_name = 'Qwen3.5 Plus'
WHERE phase_name = 'stage_6_delta_judge'
  AND is_active = true;
