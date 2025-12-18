-- =============================================================================
-- Migration: Add update_course_progress Overload for Backward Compatibility
--
-- Issue: Code calls update_course_progress with p_percent_complete parameter,
--        but current function signature uses p_error_message/p_error_details instead.
--
-- Root Cause:
-- - Current signature (20251021): p_error_message, p_error_details, p_metadata → RETURNS JSONB
-- - Code uses: p_percent_complete, p_metadata (from older API)
-- - PostgreSQL can't disambiguate between signatures with optional params
--
-- Solution: Create overload with p_percent_complete that delegates to main function.
--           This is a compatibility shim that ignores p_percent_complete since
--           the main function calculates percentage automatically based on step_id.
--
-- Impact: Resolves PGRST202 errors in logs during Stage 4 analysis workflow.
-- =============================================================================

-- =============================================================================
-- COMPATIBILITY SHIM: update_course_progress with p_percent_complete
--
-- This overload provides backward compatibility for code calling with
-- p_percent_complete parameter. The parameter is IGNORED because the main
-- function (20251021080100) calculates percentage automatically:
-- - Step 1 completed = 20%
-- - Step 2 completed = 40%
-- - Step 3 completed = 60%
-- - Step 4 completed = 80%
-- - Step 5 completed = 100%
--
-- This shim simply delegates to the main function, dropping p_percent_complete.
--
-- Parameters:
-- - p_course_id: Course UUID
-- - p_step_id: Step ID (1-5)
-- - p_status: Status (pending, in_progress, completed, failed)
-- - p_message: Russian status message
-- - p_percent_complete: IGNORED (auto-calculated by main function)
-- - p_metadata: Additional metadata (JSONB)
--
-- Security: Delegates to main SECURITY DEFINER function
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
'Backward compatibility shim for update_course_progress with p_percent_complete. Ignores p_percent_complete and delegates to main function which auto-calculates percentage. Uses SECURITY DEFINER for delegated security (CVE-2024-10976).';

-- Grant execute to service role (backend)
GRANT EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, INTEGER, JSONB) TO service_role;

-- Revoke from authenticated users (backend-only RPC)
REVOKE EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, INTEGER, JSONB) FROM authenticated;

-- =============================================================================
-- VERIFICATION: Ensure both overloads exist
-- =============================================================================

DO $$
DECLARE
  v_count INTEGER;
  v_signatures TEXT[];
BEGIN
  -- Count update_course_progress overloads
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'update_course_progress'
    AND p.prosecdef = true;  -- SECURITY DEFINER

  -- Get function signatures for logging
  SELECT pg_catalog.array_agg(pg_catalog.pg_get_function_identity_arguments(p.oid))
  INTO v_signatures
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'update_course_progress';

  -- Should have 2 overloads now
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Expected 2 update_course_progress overloads, found %. Signatures: %', v_count, v_signatures;
  END IF;

  RAISE NOTICE '✓ Both update_course_progress overloads exist';
  RAISE NOTICE '✓ Overload 1: (uuid, integer, text, text, text, jsonb, jsonb) → JSONB';
  RAISE NOTICE '✓ Overload 2: (uuid, integer, text, text, integer, jsonb) → JSONB';
  RAISE NOTICE '✓ Backward compatibility shim active';
END $$;
