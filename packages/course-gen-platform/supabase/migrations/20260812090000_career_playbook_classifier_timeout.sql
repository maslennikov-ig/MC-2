-- Career Playbook: bring the department classifier under the same timeout.
--
-- 20260811120000_career_playbook_quality_v2_routing lowered every Career
-- Playbook phase from 300000 ms to 120000 ms because three retries on a stuck
-- call cost twenty minutes. It listed ten phases and missed the eleventh:
-- `stage_career_playbook_department_classifier`, added later by
-- 20260528193000 and therefore absent from the list the quality-v2 migration
-- was written against. It is a live phase on the wizard path, it asks for at
-- most 1200 output tokens, and it was still the only Career Playbook phase that
-- could burn fifteen minutes before failing.
--
-- The proofreader keeps its own 240000 ms: it reads the whole assembled
-- document, and that budget is deliberate.
--
-- Idempotent: converges one field on one active global row.

UPDATE public.llm_model_config
SET
  timeout_ms = 120000,
  updated_at = now()
WHERE config_type = 'global'
  AND phase_name = 'stage_career_playbook_department_classifier'
  AND language = 'any'
  AND context_tier = 'standard'
  AND is_active = true;
