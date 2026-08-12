-- The unique index meant to prevent duplicate active routing rows has existed
-- since 2025-12, but Postgres treats NULLs as distinct in a unique index. Every
-- non-judge phase has judge_role IS NULL, so the index silently permitted any
-- number of identical active rows — which is how inline_block_regeneration and
-- inline_element_crud ended up with two apiece on 2026-02-11 and stayed broken
-- for six months: .maybeSingle() errors on two rows, so the lookup reported a
-- database outage and fell through to the frozen seed while the database was
-- perfectly healthy.
--
-- PG15+ can index NULLs as equal. Postgres here is 17.6.
--
-- Refs mc2-pqjgl

-- 1. Keep the oldest row of each duplicate set, retire the rest. Deactivate
--    rather than delete: the table is the audit trail for routing changes.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY config_type, course_id, phase_name, language, context_tier, judge_role
           ORDER BY created_at, id
         ) AS rn
  FROM llm_model_config
  WHERE is_active
)
UPDATE llm_model_config m
SET is_active = false, updated_at = now(), version = m.version + 1
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2. Rebuild both guards so a NULL judge_role can no longer defeat them.
--    stage_6_judge keeps three active rows per language because judge_role
--    differs (primary / secondary / tiebreaker) — that stays legal.
DROP INDEX IF EXISTS idx_llm_model_config_active_global_v2;
CREATE UNIQUE INDEX idx_llm_model_config_active_global_v2
  ON public.llm_model_config (config_type, phase_name, language, context_tier, judge_role)
  NULLS NOT DISTINCT
  WHERE is_active = true AND config_type = 'global';

DROP INDEX IF EXISTS idx_llm_model_config_active_course_v2;
CREATE UNIQUE INDEX idx_llm_model_config_active_course_v2
  ON public.llm_model_config (config_type, phase_name, course_id, language, context_tier, judge_role)
  NULLS NOT DISTINCT
  WHERE is_active = true AND config_type = 'course_override';
