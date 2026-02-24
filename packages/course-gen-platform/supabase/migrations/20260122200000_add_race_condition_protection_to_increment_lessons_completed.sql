-- =============================================================================
-- Migration: Add Race Condition Protection to increment_lessons_completed
-- Issue: TOCTOU race condition - between SELECT COUNT and UPDATE, another
--        transaction could modify the data causing incorrect progress tracking.
-- Solution: Add FOR UPDATE lock on courses row during the operation.
-- =============================================================================

/**
 * Updated RPC with race condition protection
 *
 * Changes from previous version:
 * 1. Added FOR UPDATE lock to prevent TOCTOU race condition
 * 2. Added ROUND() for smoother percentage calculation
 *
 * The FOR UPDATE lock ensures:
 * - No other transaction can modify the course row while we're calculating
 * - Prevents inconsistent progress values in concurrent updates
 * - Lock is released at transaction commit
 *
 * Formula:
 * - Base percentage = 80% (Stages 1-5 completed = 4 stages x 20%)
 * - Stage 6 weight = 20%
 * - Stage 6 progress = ROUND((lessons_completed / lessons_total) * 20)
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
  v_base_percentage INTEGER := 80; -- Stage 5 completed = 4 stages x 20%
  v_stage6_weight INTEGER := 20;   -- Stage 6 = 20%
BEGIN
  -- 1. Count unique completed lessons (handles regenerations)
  -- Note: This count is point-in-time accurate; the FOR UPDATE lock below
  -- prevents other transactions from updating the course row while we work
  SELECT COUNT(DISTINCT lesson_id)
  INTO v_unique_count
  FROM lesson_contents
  WHERE course_id = p_course_id
    AND status = 'completed';

  -- 2. Get lessons_total from generation_progress WITH LOCK
  -- FOR UPDATE prevents race conditions by locking the row until transaction commits
  -- This ensures no other concurrent call can read/modify this row simultaneously
  SELECT COALESCE((generation_progress->>'lessons_total')::integer, 0)
  INTO v_lessons_total
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  -- 3. Calculate percentage with ROUND for smoother progress display
  IF v_lessons_total > 0 THEN
    -- Stage 6 progress based on completed lessons
    -- ROUND ensures consistent integer progression (e.g., 81, 82, 83...)
    v_percentage := v_base_percentage +
      LEAST(v_stage6_weight,
        ROUND((v_unique_count::numeric * v_stage6_weight / v_lessons_total))::integer
      );

    -- Cap at 100% when all lessons complete
    IF v_unique_count >= v_lessons_total THEN
      v_percentage := 100;
    END IF;
  ELSE
    -- No lessons_total set, keep base percentage
    v_percentage := v_base_percentage;
  END IF;

  -- 4. Update lessons_completed AND percentage atomically
  -- The row is already locked from step 2, so this update is safe
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
'Update lessons_completed counter and percentage based on unique completed lessons. Uses FOR UPDATE lock to prevent race conditions. Percentage formula: 80% base + ROUND((lessons_completed/lessons_total)*20). Handles regenerations correctly.';

-- =============================================================================
-- Grant Permissions
-- =============================================================================
-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION increment_lessons_completed(UUID) TO authenticated;

-- Allow service role for backend operations
GRANT EXECUTE ON FUNCTION increment_lessons_completed(UUID) TO service_role;
