-- Add direct transition from stage_6_generating to completed
--
-- This enables auto-finalization: when auto_finalize_after_stage6=true,
-- the course can transition directly from stage_6_generating to completed
-- without going through stage_6_complete intermediate state.

CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
  v_bypass TEXT;
BEGIN
  -- Check if bypass flag is set (for restart_from_stage RPC)
  v_bypass := current_setting('app.bypass_fsm_validation', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow NULL -> any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- ==========================================================================
  -- COMPLETE FSM TRANSITION MAP
  -- ==========================================================================
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_4_init", "cancelled"],

    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_2_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "stage_2_awaiting_approval", "failed", "cancelled"],
    "stage_2_complete": ["stage_2_awaiting_approval", "stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_2_awaiting_approval": ["stage_3_init", "stage_3_summarizing", "stage_4_init", "cancelled"],

    "stage_3_init": ["stage_3_summarizing", "stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_3_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_3_awaiting_approval": ["stage_4_init", "cancelled"],

    "stage_4_init": ["stage_4_analyzing", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_complete": ["stage_4_awaiting_approval", "stage_5_init", "failed", "cancelled"],
    "stage_4_awaiting_approval": ["stage_5_init", "cancelled"],

    "stage_5_init": ["stage_5_generating", "stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_complete": ["stage_5_awaiting_approval", "stage_6_init", "finalizing", "failed", "cancelled"],
    "stage_5_awaiting_approval": ["stage_5_complete", "stage_6_init", "finalizing", "cancelled"],

    "stage_6_init": ["stage_6_generating", "stage_6_complete", "failed", "cancelled"],
    "stage_6_generating": ["stage_6_complete", "completed", "failed", "cancelled"],
    "stage_6_complete": ["finalizing", "completed", "failed", "cancelled"],

    "finalizing": ["completed", "failed", "cancelled"],

    "completed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "failed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "cancelled": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % -> % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Add comment for documentation
COMMENT ON FUNCTION validate_generation_status_transition() IS
  'FSM validation for course generation status. Updated 2026-01-20: Added stage_6_generating -> completed for auto-finalization';
