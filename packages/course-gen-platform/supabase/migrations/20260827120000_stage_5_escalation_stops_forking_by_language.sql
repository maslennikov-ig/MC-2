-- `stage_5_escalation` escalated English standard-tier courses downwards.
--
-- Six active rows. Five on openai/gpt-5.6-luna, one — language `en`,
-- context_tier `standard` — on deepseek/deepseek-v4-flash-0731 (mc2-v1p12).
-- `config-seed.json` carried the same split, so this was not drift between the
-- table and the file; it was one row that had always disagreed with its five
-- siblings and nothing compared them.
--
-- Harmless until 2026-08-23. Before that commit `getEscalationChain('generation')`
-- returned only ['stage_4_expert'] and this phase had six rows, an admin screen
-- and no caller at all. That change (mc2-9yrgb) made it the first hop, and the
-- rows started deciding something.
--
-- `selectPhaseConfig` tries [language, 'any'] in that order, so an exact match
-- wins: a Russian standard course escalated to luna and an English one to
-- deepseek. That is backwards twice over. `stage_5_normal` and `stage_5_complex`
-- both run on luna, so for them the hop was a downgrade; `stage_5_simple` runs on
-- deepseek, so for it the hop was a retry on the model that had just failed —
-- precisely what the 2026-08-23 change was written to stop.
--
-- The hop's value is its budget, not its model: 30000 output tokens against the
-- 8000 of `stage_4_expert`, with z-ai/glm-5.2 behind it as a different vendor.
-- The en/standard row kept that budget, which is why nothing broke loudly. It
-- also never fired: `generation_trace` holds zero `stage_5_escalation` rows since
-- 2026-07-01, so this is a configuration corrected before its first use rather
-- than an incident.
--
-- A tier may legitimately want a different model. A language may not, and
-- `routing-seed-integrity` now fails on any phase whose model changes with
-- language alone.

BEGIN;

UPDATE llm_model_config
SET model_id = 'openai/gpt-5.6-luna',
    primary_display_name = 'GPT-5.6 Luna',
    updated_at = NOW()
WHERE phase_name = 'stage_5_escalation'
  AND config_type = 'global'
  AND judge_role IS NULL
  AND language = 'en'
  AND context_tier = 'standard'
  AND is_active
  AND model_id = 'deepseek/deepseek-v4-flash-0731';

COMMIT;
