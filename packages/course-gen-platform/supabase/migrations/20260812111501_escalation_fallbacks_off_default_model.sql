-- Escalation phases must not fall back onto the default model: by the time they
-- run, that model has already failed on this item, so retrying it burns an
-- attempt for nothing. Keep primary and fallback on two vendors that are both
-- different from ~deepseek/deepseek-v4-flash-latest.
--
-- Follows 20260812110912_model_routing_refresh_openrouter.sql, which routed the
-- bulk of the phases but left these three pointing back at the default model.

UPDATE llm_model_config
SET fallback_model_id = 'z-ai/glm-5.2', updated_at = now(), version = version + 1
WHERE is_active
  AND phase_name IN ('stage_5_escalation', 'stage_6_auto_last_chance', 'stage_6_manual_regeneration')
  AND model_id <> 'z-ai/glm-5.2'
  AND fallback_model_id IS NOT NULL;

UPDATE llm_model_config
SET fallback_model_id = 'openai/gpt-5.6-luna', updated_at = now(), version = version + 1
WHERE is_active
  AND phase_name IN ('stage_5_escalation', 'stage_6_auto_last_chance', 'stage_6_manual_regeneration')
  AND model_id = 'z-ai/glm-5.2'
  AND fallback_model_id IS NOT NULL;
