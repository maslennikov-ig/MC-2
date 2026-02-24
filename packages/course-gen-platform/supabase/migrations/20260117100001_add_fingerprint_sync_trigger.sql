-- Migration: Add trigger to auto-sync fingerprint in log_issue_status
-- Purpose: When a status is created/updated for an error_log, automatically populate fingerprint
-- This ensures grouped view always shows correct status

-- Function to sync fingerprint from error_logs to log_issue_status
CREATE OR REPLACE FUNCTION sync_log_status_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for error_log type and when fingerprint is not already set
  IF NEW.log_type = 'error_log' AND NEW.fingerprint IS NULL THEN
    -- Get fingerprint from error_logs
    SELECT fingerprint INTO NEW.fingerprint
    FROM error_logs
    WHERE id = NEW.log_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_sync_log_status_fingerprint ON log_issue_status;

CREATE TRIGGER trg_sync_log_status_fingerprint
BEFORE INSERT OR UPDATE ON log_issue_status
FOR EACH ROW
EXECUTE FUNCTION sync_log_status_fingerprint();

-- Add comment for documentation
COMMENT ON FUNCTION sync_log_status_fingerprint() IS
'Automatically syncs fingerprint from error_logs to log_issue_status.
This ensures grouped error view shows correct status for error groups.
Triggered on INSERT/UPDATE of log_issue_status.';
