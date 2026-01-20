-- Migration: add_error_logs_status_filter_rpc
-- Purpose: Add RPC functions for filtering error_logs by status in flat view
-- These functions account for both individual log_id status AND fingerprint-based group status
-- Bug fix: Filter BEFORE pagination, not after (was causing wrong results)

-- ============================================================================
-- 1. RPC function to get all error_logs that have ANY status
--    Used for debugging and analytics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_error_logs_with_status()
RETURNS TABLE (id UUID) AS $$
  SELECT DISTINCT el.id
  FROM error_logs el
  LEFT JOIN log_issue_status lis_individual
    ON el.id = lis_individual.log_id
    AND lis_individual.log_type = 'error_log'
  LEFT JOIN log_issue_status lis_fingerprint
    ON el.fingerprint = lis_fingerprint.fingerprint
  WHERE lis_individual.id IS NOT NULL
     OR lis_fingerprint.id IS NOT NULL;
$$ LANGUAGE sql STABLE
SET search_path = public;

COMMENT ON FUNCTION get_error_logs_with_status IS
'Returns IDs of error_logs that have a status record (either by log_id or fingerprint).
Used for debugging and analytics.';

-- ============================================================================
-- 2. RPC function to get error_logs WITHOUT any status (status='new')
--    Used to INCLUDE only these logs when filtering for status='new'
--    FIX: This enables proper filtering BEFORE pagination
-- ============================================================================

CREATE OR REPLACE FUNCTION get_error_logs_without_status()
RETURNS TABLE (id UUID) AS $$
  SELECT el.id
  FROM error_logs el
  LEFT JOIN log_issue_status lis_individual
    ON el.id = lis_individual.log_id
    AND lis_individual.log_type = 'error_log'
  LEFT JOIN log_issue_status lis_fingerprint
    ON el.fingerprint = lis_fingerprint.fingerprint
  WHERE lis_individual.id IS NULL
    AND lis_fingerprint.id IS NULL;
$$ LANGUAGE sql STABLE
SET search_path = public;

COMMENT ON FUNCTION get_error_logs_without_status IS
'Returns IDs of error_logs that have NO status record (neither by log_id nor fingerprint).
Used to include only these logs when filtering for status="new" in flat view.
This enables proper filtering BEFORE pagination.';

-- ============================================================================
-- 3. RPC function to get error_logs with a specific status
--    Used to INCLUDE only these logs when filtering for a specific status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_error_logs_by_status(p_status TEXT)
RETURNS TABLE (id UUID) AS $$
  SELECT DISTINCT el.id
  FROM error_logs el
  LEFT JOIN log_issue_status lis_individual
    ON el.id = lis_individual.log_id
    AND lis_individual.log_type = 'error_log'
  LEFT JOIN log_issue_status lis_fingerprint
    ON el.fingerprint = lis_fingerprint.fingerprint
  WHERE lis_individual.status = p_status
     OR lis_fingerprint.status = p_status;
$$ LANGUAGE sql STABLE
SET search_path = public;

COMMENT ON FUNCTION get_error_logs_by_status IS
'Returns IDs of error_logs that have a specific status (by log_id or fingerprint).
Used to include only these logs when filtering by status in flat view.';
