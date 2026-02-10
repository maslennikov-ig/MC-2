-- Migration: resolve_inactive_to_verify_rpc
-- Purpose: Add RPC to auto-resolve inactive to_verify fingerprints and reopen recurred ones

-- ============================================================================
-- 1. Create function to resolve inactive to_verify fingerprints
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_inactive_to_verify(
  p_inactive_days INTEGER DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_fps TEXT[];
  v_reopened_fps TEXT[];
BEGIN
  -- ============================================================================
  -- Step 1: Resolve to_verify with NO new errors in p_inactive_days days
  -- ============================================================================

  WITH resolved AS (
    UPDATE log_issue_status SET
      status = 'resolved',
      notes = CONCAT(
        'Auto-resolved: No recurrence in ', p_inactive_days, 'd (since ',
        TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '). Prev: ',
        LEFT(COALESCE(notes, 'none'), 80)
      ),
      updated_at = NOW()
    WHERE status = 'to_verify'
      AND fingerprint IS NOT NULL
      AND updated_at < NOW() - (p_inactive_days || ' days')::INTERVAL
      AND NOT EXISTS (
        SELECT 1 FROM error_logs el
        WHERE el.fingerprint = log_issue_status.fingerprint
          AND el.created_at > log_issue_status.updated_at
      )
    RETURNING fingerprint
  )
  SELECT COALESCE(array_agg(fingerprint), '{}')
  INTO v_resolved_fps
  FROM resolved;

  -- ============================================================================
  -- Step 2: Reopen to_verify where error recurred after fix
  -- ============================================================================

  WITH reopened AS (
    UPDATE log_issue_status SET
      status = 'in_progress',
      notes = CONCAT(
        'Recurred after fix. Last seen: ',
        (SELECT TO_CHAR(MAX(el.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
         FROM error_logs el
         WHERE el.fingerprint = log_issue_status.fingerprint
           AND el.created_at > log_issue_status.updated_at),
        '. Prev: ', LEFT(COALESCE(notes, 'none'), 80)
      ),
      updated_at = NOW()
    WHERE status = 'to_verify'
      AND fingerprint IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM error_logs el
        WHERE el.fingerprint = log_issue_status.fingerprint
          AND el.created_at > log_issue_status.updated_at
      )
    RETURNING fingerprint
  )
  SELECT COALESCE(array_agg(fingerprint), '{}')
  INTO v_reopened_fps
  FROM reopened;

  -- ============================================================================
  -- Step 3: Return summary JSON
  -- ============================================================================

  RETURN jsonb_build_object(
    'resolved_count', COALESCE(array_length(v_resolved_fps, 1), 0),
    'reopened_count', COALESCE(array_length(v_reopened_fps, 1), 0),
    'resolved_fingerprints', to_jsonb(v_resolved_fps),
    'reopened_fingerprints', to_jsonb(v_reopened_fps),
    'inactive_days', p_inactive_days,
    'executed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION resolve_inactive_to_verify(INTEGER) IS
'Auto-resolves to_verify fingerprints with no recurrence in N days, reopens those that recurred. Called by scheduled monitoring.';

-- ============================================================================
-- 2. Grant execute to service role
-- ============================================================================

GRANT EXECUTE ON FUNCTION resolve_inactive_to_verify(INTEGER) TO service_role;
