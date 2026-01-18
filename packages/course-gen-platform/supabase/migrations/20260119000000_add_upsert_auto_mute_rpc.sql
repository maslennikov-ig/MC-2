-- Migration: add_upsert_auto_mute_rpc
-- Purpose: Add idempotent RPC for auto-mute status to handle race conditions
-- Fixes: duplicate key value violates unique constraint "idx_log_issue_status_fingerprint"

-- ============================================================================
-- 1. Create idempotent upsert function for auto-mute status
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_auto_mute_status(
  p_log_type TEXT,
  p_log_id UUID,
  p_fingerprint TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Idempotent insert: if fingerprint already exists, just update timestamp
  INSERT INTO log_issue_status (log_type, log_id, status, fingerprint, notes, updated_at)
  VALUES (p_log_type, p_log_id, 'auto_muted', p_fingerprint, p_notes, NOW())
  ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL
  DO UPDATE SET
    updated_at = NOW(),
    notes = COALESCE(EXCLUDED.notes, log_issue_status.notes);

  v_result := jsonb_build_object(
    'success', true,
    'fingerprint', p_fingerprint
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION upsert_auto_mute_status(TEXT, UUID, TEXT, TEXT) IS
'Idempotent auto-mute status insertion. Handles race condition when parallel errors have same fingerprint.';

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION upsert_auto_mute_status(TEXT, UUID, TEXT, TEXT) TO service_role;
