-- The prose fallback stops being the model prose was taken away from.
--
-- Every phase that AUTHORS text the reader opens ran `z-ai/glm-5.3-flash` with
-- `deepseek/deepseek-v4-flash-0731` behind it. The cross-vendor rule was
-- satisfied and the point was still missed: DeepSeek is not merely "the other
-- model" here, it is the one this seat was taken away from on 2026-08-26, and
-- for a specific fault.
--
-- The comparison of 2026-08-22 (mc2-bneet) put one micro-course through both on
-- identical settings. DeepSeek produced lessons 29% shorter, taught by narration
-- rather than worked example, and asserted "по статистике, более 60% людей..."
-- with no source — a fabricated figure inside the artifact a customer reads.
-- Judge scores barely registered it: 0.88 against 0.92.
--
-- So a z-ai outage handed every lesson back to that model, silently, and the
-- judge that missed the fabrication once would have missed it again. A fallback
-- is meant to be a different bet, not a cheaper one.
--
-- `openai/gpt-5.6-luna` is the third vendor, was itself the prose model until
-- 2026-08-26, and is already the primary on eleven other phases. It costs more
-- per output token than DeepSeek — $1.20 against $0.12 per 1M — which is the
-- price of a fallback being a fallback. It is reached only when the primary
-- fails, and over the 90 days to 2026-08-28 `generation_trace` records no prose
-- phase falling back at all.
--
-- Eighteen rows: ten Stage 6 (simple/normal/complex/refinement/section_expander
-- at both context tiers) and eight Career Playbook (the six prose groups, the
-- proofreader and the regenerator). `stage_6_content` has no row of its own and
-- is served from `STAGE6_CANONICAL_PHASE_DEFAULTS`, changed in the same commit.
--
-- The judges, the patcher and the arbiter are deliberately untouched: they edit
-- under an explicit instruction or never reach the reader, and a surgical patch
-- has no room to invent a statistic.

BEGIN;

UPDATE llm_model_config
SET fallback_model_id = 'openai/gpt-5.6-luna',
    fallback_display_name = 'GPT-5.6 Luna',
    updated_at = NOW()
WHERE config_type = 'global'
  AND judge_role IS NULL
  AND is_active
  AND model_id = 'z-ai/glm-5.3-flash'
  AND fallback_model_id = 'deepseek/deepseek-v4-flash-0731'
  AND phase_name IN (
    'stage_6_simple',
    'stage_6_normal',
    'stage_6_complex',
    'stage_6_refinement',
    'stage_6_section_expander',
    'stage_career_playbook_group_1',
    'stage_career_playbook_group_2',
    'stage_career_playbook_group_3',
    'stage_career_playbook_group_4',
    'stage_career_playbook_group_5',
    'stage_career_playbook_group_6',
    'stage_career_playbook_proofreader',
    'stage_career_playbook_regenerator'
  );

COMMIT;
