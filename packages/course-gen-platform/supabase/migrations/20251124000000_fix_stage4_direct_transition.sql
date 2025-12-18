-- ============================================================================
-- Fix FSM: Allow stage_2_complete -> stage_4_init Direct Transition
-- Purpose: Enable Stage 4 to start directly from Stage 2 when Stage 3 completes
-- Date: 2025-11-24
-- Issue: Stage 3 summarization is per-document and updates course FSM only when
--        ALL documents are complete. This creates a gap where the course-level FSM
--        stays at stage_2_complete while documents are summarized individually.
--        When all documents complete, Stage 4 should be able to start.
-- ============================================================================

-- The current FSM requires strict linear progression:
--   stage_2_complete -> stage_3_init -> stage_3_summarizing -> stage_3_complete -> stage_4_init
--
-- But in practice:
-- 1. Stage 2 completes per-document, course status becomes stage_2_complete
-- 2. Stage 3 jobs are created per-document immediately after Stage 2
-- 3. Stage 3 updates FSM to stage_3_init/stage_3_summarizing only for the last document
-- 4. When all Stage 3 jobs complete, barrier check passes
-- 5. E2E test or analysis.start endpoint tries to transition to stage_4_init
--
-- The issue is that update_course_progress() with step_id=3 goes:
-- - 'in_progress' -> stage_3_summarizing (but FSM requires stage_3_init first!)
-- - 'completed' -> stage_3_complete
--
-- Two valid solutions:
-- A) Fix update_course_progress to call stage_3_init before stage_3_summarizing
-- B) Allow stage_2_complete -> stage_4_init directly in FSM
--
-- We choose option B because:
-- - Stage 3 is document-level, not course-level
-- - The barrier check (validateStage4Barrier) already ensures all docs are summarized
-- - This is simpler and more robust
-- - Also add stage_2_complete -> stage_3_summarizing for current behavior

-- Recreate the validation function with updated transitions
CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
BEGIN
  -- Allow NULL → any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- Define valid stage-based transitions (linear progression + error handling)
  -- Updated 2025-11-24: Added stage_2_complete -> stage_4_init and stage_3_summarizing
  -- to support cases where Stage 3 is per-document and doesn't need course-level init
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_4_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "failed", "cancelled"],
    "stage_2_complete": ["stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_3_init": ["stage_3_summarizing", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_4_init", "failed", "cancelled"],
    "stage_4_init": ["stage_4_analyzing", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "failed", "cancelled"],
    "stage_4_complete": ["stage_5_init", "failed", "cancelled"],
    "stage_5_init": ["stage_5_generating", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "failed", "cancelled"],
    "stage_5_complete": ["finalizing", "failed", "cancelled"],
    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending"],
    "cancelled": ["pending"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % → % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_generation_status_transition IS 'Validates course generation status transitions (updated 2025-11-24: allow stage_2_complete -> stage_4_init and stage_3_summarizing for per-document Stage 3 workflow)';

-- ============================================================================
-- Changes Made:
-- ============================================================================
-- 1. "pending": Added "stage_4_init" for courses without documents (analysis-only path)
-- 2. "stage_2_complete": Added "stage_3_summarizing" (for when first Stage 3 job starts)
-- 3. "stage_2_complete": Added "stage_4_init" (for when Stage 4 starts after Stage 3 barrier passes)
--
-- Workflow Scenarios:
--
-- Scenario A: Course with documents (normal flow)
-- - pending → stage_2_init → stage_2_processing → stage_2_complete
-- - Stage 3 jobs process documents (per-document, may not update course FSM)
-- - When all docs complete, barrier passes → stage_2_complete → stage_4_init ✅
--
-- Scenario B: Course with documents (Stage 3 updates FSM)
-- - pending → stage_2_init → stage_2_processing → stage_2_complete
-- - First Stage 3 job starts → stage_2_complete → stage_3_summarizing ✅
-- - ... → stage_3_complete → stage_4_init
--
-- Scenario C: Course without documents (analysis-only)
-- - pending → stage_4_init ✅ (direct to analysis)
-- ============================================================================
