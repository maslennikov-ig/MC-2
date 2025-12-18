-- =============================================================================
-- Fix FSM to allow direct transitions to awaiting_approval states
-- Migration: 20251126150000_fix_fsm_awaiting_approval_transitions
--
-- Problem found:
-- The FSM validation function didn't allow direct transitions from processing
-- states (e.g., stage_4_analyzing) to awaiting_approval states. This caused
-- handlers to fail when setting awaiting_approval status, resulting in job
-- retries and duplicate stage executions.
--
-- Fix:
-- Add awaiting_approval to valid transitions from all processing states.
-- =============================================================================

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

  -- Define valid stage-based transitions
  -- Updated 2025-11-26: Allow direct transitions to awaiting_approval from processing states
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_4_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_2_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "stage_2_awaiting_approval", "failed", "cancelled"],
    "stage_2_complete": ["stage_2_awaiting_approval", "stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_2_awaiting_approval": ["stage_3_init", "cancelled"],

    "stage_3_init": ["stage_3_summarizing", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_3_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_3_awaiting_approval": ["stage_4_init", "cancelled"],

    "stage_4_init": ["stage_4_analyzing", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_complete": ["stage_4_awaiting_approval", "stage_5_init", "failed", "cancelled"],
    "stage_4_awaiting_approval": ["stage_5_init", "cancelled"],

    "stage_5_init": ["stage_5_generating", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_complete": ["stage_5_awaiting_approval", "finalizing", "failed", "cancelled"],
    "stage_5_awaiting_approval": ["stage_5_complete", "finalizing", "cancelled"],

    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending", "stage_2_init", "stage_4_init"],
    "cancelled": ["pending", "stage_2_init", "stage_4_init"]
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
