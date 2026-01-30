-- Migration: Add RPC function to get error log IDs with "new" status efficiently
-- Purpose: Fix list view missing new errors due to Supabase 1000 row limit
-- Issue: mc2-ud16

-- This function returns error_log IDs that are considered "new":
-- 1. Logs WITHOUT any status record for their fingerprint
-- 2. Logs WITH explicit status='new' in log_issue_status

CREATE OR REPLACE FUNCTION get_new_error_log_ids()
RETURNS TABLE(id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT el.id
    FROM error_logs el
    WHERE el.fingerprint IS NOT NULL
      AND (
        -- Fingerprint has explicit 'new' status
        EXISTS (
          SELECT 1 FROM log_issue_status lis
          WHERE lis.fingerprint = el.fingerprint
            AND lis.log_type = 'error_log'
            AND lis.status = 'new'
        )
        OR
        -- Fingerprint has NO status record at all
        NOT EXISTS (
          SELECT 1 FROM log_issue_status lis
          WHERE lis.fingerprint = el.fingerprint
            AND lis.log_type = 'error_log'
        )
      );
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission to authenticated users (admin check is in tRPC)
GRANT EXECUTE ON FUNCTION get_new_error_log_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_new_error_log_ids() TO service_role;

COMMENT ON FUNCTION get_new_error_log_ids() IS
  'Returns error_log IDs with "new" status (no status record or explicit new). Used by admin logs list view.';
