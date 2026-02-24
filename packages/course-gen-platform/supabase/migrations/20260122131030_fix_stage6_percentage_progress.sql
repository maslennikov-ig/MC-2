-- =============================================================================
-- Migration: Fix Stage 6 Progress Percentage
-- Issue: Progress bar sticks after Stage 5 because increment_lessons_completed
--        only updates lessons_completed but not percentage.
-- Solution: Update RPC to calculate and update percentage based on lesson progress.
-- =============================================================================

/**
 * Updated RPC to update both lessons_completed AND percentage
 *
 * Formula:
 * - Base percentage = 80% (Stages 1-5 completed = 4 stages × 20%)
 * - Stage 6 weight = 20%
 * - Stage 6 progress = (lessons_completed / lessons_total) * 20
 * - Total percentage = base + stage6_progress
 * - When all lessons complete: percentage = 100%
 *
 * @param p_course_id - Course UUID
 * @returns Updated lessons_completed count (unique lessons)
 */
CREATE OR REPLACE FUNCTION increment_lessons_completed(
  p_course_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_unique_count INTEGER;
  v_lessons_total INTEGER;
  v_percentage INTEGER;
  v_base_percentage INTEGER := 80; -- Stage 5 completed = 4 stages × 20%
  v_stage6_weight INTEGER := 20;   -- Stage 6 = 20%
BEGIN
  -- 1. Count unique completed lessons (handles regenerations)
  SELECT COUNT(DISTINCT lesson_id)
  INTO v_unique_count
  FROM lesson_contents
  WHERE course_id = p_course_id
    AND status = 'completed';

  -- 2. Get lessons_total from generation_progress
  SELECT COALESCE((generation_progress->>'lessons_total')::integer, 0)
  INTO v_lessons_total
  FROM courses
  WHERE id = p_course_id;

  -- 3. Calculate percentage
  IF v_lessons_total > 0 THEN
    -- Stage 6 progress based on completed lessons
    v_percentage := v_base_percentage +
      LEAST(v_stage6_weight, (v_unique_count * v_stage6_weight / v_lessons_total));

    -- Cap at 100% when all lessons complete
    IF v_unique_count >= v_lessons_total THEN
      v_percentage := 100;
    END IF;
  ELSE
    -- No lessons_total set, keep base percentage
    v_percentage := v_base_percentage;
  END IF;

  -- 4. Update lessons_completed AND percentage atomically
  UPDATE courses
  SET
    generation_progress = jsonb_set(
      jsonb_set(
        COALESCE(generation_progress, '{}'::jsonb),
        '{lessons_completed}',
        to_jsonb(v_unique_count)
      ),
      '{percentage}',
      to_jsonb(v_percentage)
    ),
    updated_at = NOW()
  WHERE id = p_course_id;

  RETURN v_unique_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

COMMENT ON FUNCTION increment_lessons_completed IS
'Update lessons_completed counter and percentage based on unique completed lessons. Percentage formula: 80% base + (lessons_completed/lessons_total)*20%. Handles regenerations correctly.';
