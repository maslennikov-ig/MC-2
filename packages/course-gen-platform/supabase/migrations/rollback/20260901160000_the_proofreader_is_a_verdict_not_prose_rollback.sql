-- Put the proofreader back on the prose model.
--
-- Restores the state 20260826200000_prose_phases_move_to_glm_5_3_flash.sql left
-- it in. Note that the pass asks for its verdict as a JSON schema, and three of
-- glm-5.3-flash's four cheapest endpoints do not accept one — the routing picks
-- among those that do, which costs about 3x per call.

BEGIN;

UPDATE llm_model_config
SET model_id = 'z-ai/glm-5.3-flash',
    primary_display_name = 'GLM 5.3 Flash',
    updated_at = NOW()
WHERE config_type = 'global'
  AND judge_role IS NULL
  AND is_active
  AND phase_name = 'stage_career_playbook_proofreader'
  AND model_id = 'deepseek/deepseek-v4-flash-0731';

COMMIT;
