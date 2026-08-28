-- `stage_6_content` was the last phase the superadmin panel could not reach,
-- and the reason turned out to be a CHECK constraint no migration in this
-- repository mentions.
--
-- It is not a dormant name. Two live callers ask for it:
--
--   * `services/model-service.ts getJobTimeout` reads its `timeout_ms` and uses
--     it as the Stage 6 BullMQ job timeout.
--   * `nodes/generator/generator-request.ts` labels a call `stage_6_content`
--     whenever a model override is in force — the escalation and CJK paths — so
--     cost attribution and the service tier hang off it.
--
-- With no row, `getModelForPhase('stage_6_content')` missed the database and
-- resolved from `STAGE6_CANONICAL_PHASE_DEFAULTS`, compiled into the binary. The
-- model was right, the mechanism was not: an operator could see the phase in the
-- panel and change nothing, and the Stage 6 job timeout was editable only by a
-- deploy.
--
-- Widening the constraint rather than working around it. Three lists of phase
-- names exist — this CHECK (72 entries), the `PhaseName` union and
-- `phaseNameSchema` (61 each) — and comparing them on 2026-08-28 found the
-- disagreement to be exactly symmetric: twelve `stage_career_playbook_*` names
-- the database accepts and the panel rejects, and this one name the panel
-- accepts and the database rejects. The other twelve are fixed in the same
-- commit, on the TypeScript side. `tests/unit/phase-names-are-one-list.test.ts`
-- now fails if a phase with a seed row is missing from the panel's enum.
--
-- The two inserted rows reproduce the compiled values exactly — model, fallback,
-- temperature, budget, context, retries and the 300 000 ms timeout — so nothing
-- moves today. The change is that they can move tomorrow without a release.
--
-- Two tiers because every sibling has two (`stage_6_simple`, `_normal`,
-- `_complex`, `_refinement`, `_section_expander`), and `getModelForPhase`
-- selects on `context_tier`; a standard-only row would silently fall back for a
-- large lesson.

BEGIN;

ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config
  ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
    phase_name = ANY (ARRAY[
      'global_default',
      'stage_2_summarization', 'stage_2_standard_ru', 'stage_2_standard_en',
      'stage_2_extended_ru', 'stage_2_extended_en',
      'stage_3_classification',
      'stage_4_clarifying', 'stage_4_classification', 'stage_4_scope',
      'stage_4_expert', 'stage_4_synthesis', 'stage_4_standard_ru',
      'stage_4_standard_en', 'stage_4_extended_ru', 'stage_4_extended_en',
      'stage_5_metadata', 'stage_5_sections', 'stage_5_tier1',
      'stage_5_escalation', 'stage_5_simple', 'stage_5_normal',
      'stage_5_complex', 'stage_5_standard_ru', 'stage_5_standard_en',
      'stage_5_extended_ru', 'stage_5_extended_en',
      'stage_6_judge', 'stage_6_content', 'stage_6_refinement',
      'stage_6_rag_planning', 'stage_6_simple', 'stage_6_normal',
      'stage_6_complex', 'stage_6_auto_last_chance',
      'stage_6_manual_regeneration', 'stage_6_standard_ru',
      'stage_6_standard_en', 'stage_6_extended_ru', 'stage_6_extended_en',
      'stage_6_arbiter', 'stage_6_patcher', 'stage_6_section_expander',
      'stage_6_delta_judge',
      'stage_7_cover', 'stage_7_card', 'stage_7_video', 'stage_7_audio',
      'stage_7_quiz', 'stage_7_presentation', 'stage_7_document',
      'stage_career_playbook_department_classifier',
      'stage_career_playbook_followup', 'stage_career_playbook_spec',
      'stage_career_playbook_group_1', 'stage_career_playbook_group_2',
      'stage_career_playbook_group_3', 'stage_career_playbook_group_4',
      'stage_career_playbook_group_5', 'stage_career_playbook_group_6',
      'stage_career_playbook_judge', 'stage_career_playbook_proofreader',
      'stage_career_playbook_regenerator',
      'chat_intent_classification', 'chat_node_refinement',
      'chat_global_guidance', 'chat_full_regeneration',
      'chat_stage_5_refinement', 'chat_stage_6_refinement',
      'inline_block_regeneration', 'inline_element_crud',
      'emergency', 'quality_fallback'
    ])
  );

INSERT INTO llm_model_config (
  config_type, course_id, phase_name, stage_number,
  model_id, primary_display_name,
  fallback_model_id, fallback_display_name,
  temperature, max_tokens, max_context_tokens,
  language, context_tier, threshold_tokens,
  cache_read_enabled, max_retries, timeout_ms,
  reasoning_enabled, version, is_active
)
SELECT
  'global', NULL, 'stage_6_content', 6,
  'z-ai/glm-5.3-flash', 'GLM 5.3 Flash',
  'openai/gpt-5.6-luna', 'GPT-5.6 Luna',
  0.70, 8000, 128000,
  'any', tier.name, 80000,
  false, 3, 300000,
  false, 1, true
FROM (VALUES ('standard'), ('extended')) AS tier(name)
WHERE NOT EXISTS (
  SELECT 1 FROM llm_model_config existing
  WHERE existing.phase_name = 'stage_6_content'
    AND existing.config_type = 'global'
    AND existing.course_id IS NULL
    AND existing.context_tier = tier.name
    AND existing.language = 'any'
    AND existing.judge_role IS NULL
    AND existing.is_active
);

COMMIT;
