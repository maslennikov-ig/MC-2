-- Migration: reset_resolved_on_new_error
-- Purpose: When a new error with same fingerprint appears after status was 'resolved',
-- reset status to 'new' because the fix didn't work.
-- This prevents "resolved" errors from hiding recurring issues.

-- ============================================================================
-- 1. Function to reset 'resolved' status when new error appears
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_resolved_status_on_new_error()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if fingerprint exists
  IF NEW.fingerprint IS NOT NULL THEN
    -- Check if there's a 'resolved' status for this fingerprint
    -- and if the new error was created AFTER the status was set to resolved
    UPDATE log_issue_status
    SET
      status = 'new',
      notes = CONCAT(
        '[Auto-reopened: ', TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), ' UTC] ',
        'Error recurred after being marked resolved. Previous notes: ',
        COALESCE(notes, 'none')
      ),
      updated_at = NOW()
    WHERE fingerprint = NEW.fingerprint
      AND status = 'resolved'
      AND updated_at < NEW.created_at;

    -- Log if we reopened an issue (for debugging)
    IF FOUND THEN
      RAISE NOTICE 'Reopened resolved issue for fingerprint: %', NEW.fingerprint;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

COMMENT ON FUNCTION reset_resolved_status_on_new_error() IS
'Automatically resets fingerprint status from "resolved" to "new" when a new error
with the same fingerprint appears. This ensures that recurring errors are not hidden
by outdated "resolved" status. Only triggers if new error was created AFTER the
status was set to resolved.';

-- ============================================================================
-- 2. Trigger on error_logs INSERT
-- ============================================================================

DROP TRIGGER IF EXISTS trg_reset_resolved_on_new_error ON error_logs;

CREATE TRIGGER trg_reset_resolved_on_new_error
AFTER INSERT ON error_logs
FOR EACH ROW
EXECUTE FUNCTION reset_resolved_status_on_new_error();

COMMENT ON TRIGGER trg_reset_resolved_on_new_error ON error_logs IS
'Resets "resolved" status to "new" when a new error with same fingerprint appears,
preventing outdated fixes from hiding recurring issues.';
