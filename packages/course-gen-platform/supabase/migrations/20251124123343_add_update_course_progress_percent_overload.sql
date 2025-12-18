-- =============================================================================
-- Migration: Add update_course_progress Overload for Backward Compatibility
-- Issue: Code calls update_course_progress with p_percent_complete parameter,
--        but current function signature uses p_error_message/p_error_details instead.
-- Solution: Create overload with p_percent_complete that delegates to main function.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_percent_complete INTEGER, -- MUST be required to disambiguate from main function
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Delegate to main function (p_percent_complete is ignored)
  -- Main function calculates percentage based on step_id automatically
  SELECT update_course_progress(
    p_course_id := p_course_id,
    p_step_id := p_step_id,
    p_status := p_status,
    p_message := p_message,
    p_error_message := NULL,
    p_error_details := NULL,
    p_metadata := p_metadata
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, INTEGER, JSONB) IS
'Backward compatibility shim for update_course_progress with p_percent_complete. Ignores p_percent_complete and delegates to main function which auto-calculates percentage.';

-- Grant execute to service role (backend)
GRANT EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, INTEGER, JSONB) TO service_role;

-- Revoke from authenticated users (backend-only RPC)
REVOKE EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, INTEGER, JSONB) FROM authenticated;
