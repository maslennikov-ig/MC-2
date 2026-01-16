-- Migration: add_error_log_fingerprint
-- Purpose: Add fingerprint column to error_logs for grouping similar errors
-- When 500 identical errors occur, we see 1 row with "x500" instead of 500 rows

-- ============================================================================
-- 1. Add fingerprint column to error_logs table
-- ============================================================================

ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Index for fingerprint lookups (grouping queries)
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Composite index for filtering by fingerprint + time range (common admin query)
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint_created ON error_logs(fingerprint, created_at DESC);

COMMENT ON COLUMN error_logs.fingerprint IS
'MD5 hash of normalized error components (job_type + error_message + normalized_stack_trace). Enables grouping of identical errors.';

-- ============================================================================
-- 2. Function to normalize stack trace (remove dynamic parts)
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_stack_trace(stack TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized TEXT;
BEGIN
    IF stack IS NULL THEN
        RETURN '';
    END IF;

    normalized := stack;

    -- Remove line numbers and column numbers (e.g., :42:10, :123)
    normalized := regexp_replace(normalized, ':\d+:\d+', ':X:X', 'g');
    normalized := regexp_replace(normalized, ':\d+\)', ':X)', 'g');
    normalized := regexp_replace(normalized, ':\d+$', ':X', 'gm');

    -- Remove UUIDs (8-4-4-4-12 hex pattern)
    normalized := regexp_replace(
        normalized,
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        '<UUID>',
        'g'
    );

    -- Remove memory addresses (0x followed by hex)
    normalized := regexp_replace(normalized, '0x[0-9a-fA-F]+', '<ADDR>', 'g');

    -- Remove timestamps in various formats
    -- ISO 8601: 2025-01-17T12:34:56.789Z
    normalized := regexp_replace(
        normalized,
        '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?',
        '<TIMESTAMP>',
        'g'
    );
    -- Unix timestamps (10-13 digits)
    normalized := regexp_replace(normalized, '\b\d{10,13}\b', '<UNIXTIME>', 'g');

    -- Remove PIDs and process IDs
    normalized := regexp_replace(normalized, '\bpid[=: ]\d+', 'pid=<PID>', 'gi');

    -- Remove port numbers in URLs/addresses
    normalized := regexp_replace(normalized, ':\d{4,5}/', ':<PORT>/', 'g');

    -- Remove job IDs (common pattern: job-xxx or jobId: xxx)
    normalized := regexp_replace(normalized, 'job[_-]?[iI]d[=: ]+\S+', 'jobId=<JOBID>', 'gi');

    -- Remove request IDs
    normalized := regexp_replace(normalized, 'req[uest]*[_-]?[iI]d[=: ]+\S+', 'requestId=<REQID>', 'gi');

    -- Remove session IDs
    normalized := regexp_replace(normalized, 'session[_-]?[iI]d[=: ]+\S+', 'sessionId=<SESSID>', 'gi');

    -- Normalize whitespace (collapse multiple spaces/newlines)
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');

    -- Trim
    normalized := trim(normalized);

    RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = public;

COMMENT ON FUNCTION normalize_stack_trace(TEXT) IS
'Removes dynamic parts from stack traces (line numbers, UUIDs, timestamps, addresses) to enable fingerprint-based grouping of identical errors.';

-- ============================================================================
-- 3. Function to generate error fingerprint
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_error_fingerprint(
    p_message TEXT,
    p_stack TEXT,
    p_job_type TEXT
) RETURNS TEXT AS $$
DECLARE
    normalized_message TEXT;
    normalized_stack TEXT;
    fingerprint_input TEXT;
BEGIN
    -- Normalize message (remove dynamic parts similar to stack)
    normalized_message := COALESCE(p_message, '');

    -- Apply same normalization to message
    normalized_message := regexp_replace(
        normalized_message,
        '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        '<UUID>',
        'g'
    );
    normalized_message := regexp_replace(
        normalized_message,
        '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?',
        '<TIMESTAMP>',
        'g'
    );
    normalized_message := regexp_replace(normalized_message, '\b\d{10,13}\b', '<UNIXTIME>', 'g');
    normalized_message := trim(normalized_message);

    -- Normalize stack trace
    normalized_stack := normalize_stack_trace(p_stack);

    -- Build fingerprint input: job_type || message || stack
    fingerprint_input := COALESCE(p_job_type, '') || '|' || normalized_message || '|' || normalized_stack;

    -- Return MD5 hash as fingerprint
    RETURN md5(fingerprint_input);
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = public;

COMMENT ON FUNCTION generate_error_fingerprint(TEXT, TEXT, TEXT) IS
'Generates MD5 fingerprint from job_type, error_message, and normalized stack_trace. Used to group identical errors.';

-- ============================================================================
-- 4. Trigger to auto-generate fingerprint on INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_error_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fingerprint IS NULL THEN
        NEW.fingerprint := generate_error_fingerprint(
            NEW.error_message,
            NEW.stack_trace,
            NEW.job_type
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS set_error_fingerprint_before_insert ON error_logs;
CREATE TRIGGER set_error_fingerprint_before_insert
    BEFORE INSERT ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_error_fingerprint();

COMMENT ON TRIGGER set_error_fingerprint_before_insert ON error_logs IS
'Auto-generates fingerprint for new error_logs entries to enable error grouping.';

-- ============================================================================
-- 5. Backfill existing records with fingerprints
-- ============================================================================

UPDATE error_logs
SET fingerprint = generate_error_fingerprint(error_message, stack_trace, job_type)
WHERE fingerprint IS NULL;

-- ============================================================================
-- 6. Add fingerprint column to log_issue_status for group-level status
-- ============================================================================

ALTER TABLE log_issue_status
ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Unique index on fingerprint (one status per error group)
-- Partial index: only for records that have fingerprint set
CREATE UNIQUE INDEX IF NOT EXISTS idx_log_issue_status_fingerprint
ON log_issue_status(fingerprint)
WHERE fingerprint IS NOT NULL;

-- Index for querying by fingerprint
CREATE INDEX IF NOT EXISTS idx_log_issue_status_fingerprint_lookup
ON log_issue_status(fingerprint)
WHERE fingerprint IS NOT NULL;

COMMENT ON COLUMN log_issue_status.fingerprint IS
'Error fingerprint for group-level status tracking. When set, this status applies to all errors with the same fingerprint.';

-- ============================================================================
-- 7. Documentation
-- ============================================================================

COMMENT ON INDEX idx_error_logs_fingerprint IS
'Enables efficient grouping queries: SELECT fingerprint, COUNT(*) FROM error_logs GROUP BY fingerprint';

COMMENT ON INDEX idx_error_logs_fingerprint_created IS
'Enables efficient queries for latest error per group with time-based filtering';

COMMENT ON INDEX idx_log_issue_status_fingerprint IS
'Ensures only one status record per error fingerprint group';
