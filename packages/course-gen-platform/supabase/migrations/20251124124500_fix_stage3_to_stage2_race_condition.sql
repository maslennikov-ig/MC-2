-- ============================================================================
-- Fix FSM: Allow stage_3 states -> stage_2_complete Transition
-- Purpose: Race condition when Stage 2 documents complete after Stage 3 starts.
--          The orchestrator tries to mark Stage 2 complete but Stage 3 is already
--          in progress (stage_3_summarizing). This is a valid race condition scenario.
-- Issue: stage_3_summarizing -> stage_2_complete is rejected, but valid use case exists.
-- Date: 2025-11-24
-- ============================================================================

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

  -- Define valid stage-based transitions (linear progression + error handling + race conditions)
  -- Updated 2025-11-24: Added stage_3 states -> stage_2_complete for race condition handling
  -- When documents complete processing, Stage 3 may already be in progress
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_4_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "failed", "cancelled"],
    "stage_2_complete": ["stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_3_init": ["stage_3_summarizing", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_2_complete", "failed", "cancelled"],
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

COMMENT ON FUNCTION validate_generation_status_transition IS 'Validates course generation status transitions (updated 2025-11-24: allow stage_3 states -> stage_2_complete for race condition handling)';
