-- Update RPC Function to map completion to awaiting_approval
-- Purpose: Implement stage gates by setting status to awaiting_approval instead of complete
-- Date: 2025-11-26

CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_progress JSONB;
  v_step_index INTEGER;
  v_percentage INTEGER;
  v_generation_status generation_status;
BEGIN
  -- Validate step_id (2-6, Step 1 removed in FSM redesign)
  IF p_step_id < 2 OR p_step_id > 6 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 2-6', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed|cancelled', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based, maintains backward compatibility with existing JSONB structure)
  v_step_index := p_step_id - 1;

  -- Map step_id + status to NEW generation_status FSM states
  -- Updated 2025-11-26: Map completed to awaiting_approval for Stages 2-5
  v_generation_status := CASE
    -- Global error states (override all step-specific logic)
    WHEN p_status = 'failed' THEN 'failed'::generation_status
    WHEN p_status = 'cancelled' THEN 'cancelled'::generation_status

    -- Step 2: Document Processing
    WHEN p_step_id = 2 AND p_status = 'pending' THEN 'stage_2_init'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' THEN 'stage_2_processing'::generation_status
    WHEN p_step_id = 2 AND p_status = 'completed' THEN 'stage_2_awaiting_approval'::generation_status

    -- Step 3: Summarization
    WHEN p_step_id = 3 AND p_status = 'pending' THEN 'stage_3_init'::generation_status
    WHEN p_step_id = 3 AND p_status = 'in_progress' THEN 'stage_3_summarizing'::generation_status
    WHEN p_step_id = 3 AND p_status = 'completed' THEN 'stage_3_awaiting_approval'::generation_status

    -- Step 4: Structure Analysis
    WHEN p_step_id = 4 AND p_status = 'pending' THEN 'stage_4_init'::generation_status
    WHEN p_step_id = 4 AND p_status = 'in_progress' THEN 'stage_4_analyzing'::generation_status
    WHEN p_step_id = 4 AND p_status = 'completed' THEN 'stage_4_awaiting_approval'::generation_status

    -- Step 5: Content Generation
    WHEN p_step_id = 5 AND p_status = 'pending' THEN 'stage_5_init'::generation_status
    WHEN p_step_id = 5 AND p_status = 'in_progress' THEN 'stage_5_generating'::generation_status
    WHEN p_step_id = 5 AND p_status = 'completed' THEN 'stage_5_awaiting_approval'::generation_status

    -- Step 6: Finalization
    WHEN p_step_id = 6 AND p_status = 'in_progress' THEN 'finalizing'::generation_status
    WHEN p_step_id = 6 AND p_status = 'completed' THEN 'completed'::generation_status

    -- Fallback: Keep existing status (should never happen with validation above)
    ELSE NULL
  END;

  -- Raise exception if no valid mapping exists (data integrity check)
  IF v_generation_status IS NULL THEN
    RAISE EXCEPTION 'No FSM mapping for step_id=% status=% (course_id: %)',
      p_step_id, p_status, p_course_id;
  END IF;

  -- Set trigger source for audit logging
  PERFORM set_config('app.trigger_source', 'rpc', true);

  -- Update both generation_progress JSONB AND generation_status
  UPDATE courses
  SET
    generation_progress = CASE
      WHEN p_error_message IS NOT NULL THEN
        -- With error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      generation_progress,
                      array['steps', v_step_index::text, 'status'],
                      to_jsonb(p_status)
                    ),
                    array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                    to_jsonb(NOW())
                  ),
                  array['percentage'],
                  to_jsonb(v_percentage)
                ),
                array['current_step'],
                to_jsonb(p_step_id)
              ),
              array['message'],
              to_jsonb(p_message)
            ),
            array['steps', v_step_index::text, 'error'],
            to_jsonb(p_error_message)
          ),
          array['steps', v_step_index::text, 'error_details'],
          COALESCE(p_error_details, '{}'::jsonb)
        )
      ELSE
        -- Without error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  generation_progress,
                  array['steps', v_step_index::text, 'status'],
                  to_jsonb(p_status)
                ),
                array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                to_jsonb(NOW())
              ),
              array['percentage'],
              to_jsonb(v_percentage)
            ),
            array['current_step'],
            to_jsonb(p_step_id)
          ),
          array['message'],
          to_jsonb(p_message)
        )
    END,
    -- Update generation_status with NEW FSM state
    generation_status = v_generation_status,
    -- Update error fields in courses table (for easy querying)
    error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE error_message END,
    error_details = CASE WHEN p_status = 'failed' THEN p_error_details ELSE error_details END,
    -- Update timestamps
    generation_completed_at = CASE WHEN v_generation_status = 'completed' THEN NOW() ELSE generation_completed_at END,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;

  -- Return updated progress (NULL if course not found)
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_course_progress IS 'Update course generation progress (JSONB) and generation_status (FSM ENUM) atomically. Updated 2025-11-26 to support stage gates.';
