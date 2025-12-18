-- ============================================================================
-- Update RPC Function to Sync generation_status
-- Purpose: Maintain both generation_progress JSONB and generation_status ENUM
-- Date: 2025-10-21
-- Dependencies: 20251021080000_add_generation_status_field.sql
-- ============================================================================

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
  v_has_files BOOLEAN;
BEGIN
  -- Validate step_id (1-5)
  IF p_step_id < 1 OR p_step_id > 5 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 1-5', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based)
  v_step_index := p_step_id - 1;

  -- Get has_files flag for step 2 branching
  SELECT (generation_progress->>'has_documents')::boolean INTO v_has_files
  FROM courses
  WHERE id = p_course_id;

  -- Map step and status to generation_status ENUM
  v_generation_status := CASE
    -- Failed state overrides everything
    WHEN p_status = 'failed' THEN 'failed'::generation_status

    -- Pending: Set to pending only on first step
    WHEN p_step_id = 1 AND p_status = 'pending' THEN 'pending'::generation_status

    -- In-progress statuses
    WHEN p_step_id = 1 AND p_status = 'in_progress' THEN 'initializing'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' AND v_has_files THEN 'processing_documents'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' AND NOT v_has_files THEN 'analyzing_task'::generation_status
    WHEN p_step_id = 3 AND p_status = 'in_progress' THEN 'generating_structure'::generation_status
    WHEN p_step_id = 4 AND p_status = 'in_progress' THEN 'generating_content'::generation_status
    WHEN p_step_id = 5 AND p_status = 'in_progress' THEN 'finalizing'::generation_status

    -- Completed step transitions (advance to next step's status)
    WHEN p_step_id = 1 AND p_status = 'completed' THEN
      CASE WHEN v_has_files THEN 'processing_documents'::generation_status
           ELSE 'analyzing_task'::generation_status END
    WHEN p_step_id = 2 AND p_status = 'completed' THEN 'generating_structure'::generation_status
    WHEN p_step_id = 3 AND p_status = 'completed' THEN 'generating_content'::generation_status
    WHEN p_step_id = 4 AND p_status = 'completed' THEN 'finalizing'::generation_status
    WHEN p_step_id = 5 AND p_status = 'completed' THEN 'completed'::generation_status

    -- Keep existing status if no mapping
    ELSE NULL
  END;

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
    -- Update generation_status (if mapped, otherwise keep existing)
    generation_status = COALESCE(v_generation_status, generation_status),
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

-- Grant execute to service role (backend)
GRANT EXECUTE ON FUNCTION update_course_progress TO service_role;

-- Revoke from authenticated users (backend-only RPC)
REVOKE EXECUTE ON FUNCTION update_course_progress FROM authenticated;

COMMENT ON FUNCTION update_course_progress IS 'Update course generation progress (JSONB) and generation_status (ENUM) atomically';

-- ============================================================================
-- Migration complete
-- ============================================================================
