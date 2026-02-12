-- Add 'test' to environment CHECK constraint on error_logs
-- This allows test environment errors to be properly tagged and auto-muted
ALTER TABLE error_logs DROP CONSTRAINT IF EXISTS error_logs_environment_check;
ALTER TABLE error_logs ADD CONSTRAINT error_logs_environment_check
  CHECK (environment IN ('dev', 'stage', 'test'));
