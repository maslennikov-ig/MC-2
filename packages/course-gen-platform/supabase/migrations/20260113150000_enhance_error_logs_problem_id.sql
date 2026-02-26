-- Migration: enhance_error_logs_problem_id
-- Purpose: Add problem_id (2025-01-13#42 format), environment tracking, and to_verify status
-- Issue: mc2-cdb

-- ============================================================================
-- 1. Add new columns to error_logs table
-- ============================================================================

-- Problem ID: Generated as "YYYY-MM-DD#N" where N is daily counter
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS problem_id TEXT UNIQUE;

-- Environment: dev or stage
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS environment TEXT CHECK (environment IN ('dev', 'stage'));

-- Create index for problem_id lookups
CREATE INDEX IF NOT EXISTS idx_error_logs_problem_id ON error_logs(problem_id);

-- Create index for environment filtering
CREATE INDEX IF NOT EXISTS idx_error_logs_environment ON error_logs(environment);

-- ============================================================================
-- 2. Create sequence table for daily problem ID counter
-- ============================================================================

CREATE TABLE IF NOT EXISTS problem_id_sequences (
    date_key DATE PRIMARY KEY,
    next_sequence INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for problem_id_sequences (service role only)
ALTER TABLE problem_id_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_problem_id_sequences"
    ON problem_id_sequences
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. Function to generate next problem_id
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_problem_id()
RETURNS TEXT AS $$
DECLARE
    today DATE := CURRENT_DATE;
    seq_num INTEGER;
BEGIN
    -- Atomic increment: Insert or update sequence
    INSERT INTO problem_id_sequences (date_key, next_sequence)
    VALUES (today, 1)
    ON CONFLICT (date_key) DO UPDATE
    SET next_sequence = problem_id_sequences.next_sequence + 1
    RETURNING next_sequence INTO seq_num;

    -- Return formatted problem_id: "2025-01-13#42"
    RETURN TO_CHAR(today, 'YYYY-MM-DD') || '#' || seq_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Trigger to auto-generate problem_id on insert
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_problem_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.problem_id IS NULL THEN
        NEW.problem_id := generate_problem_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_problem_id_before_insert ON error_logs;
CREATE TRIGGER set_problem_id_before_insert
    BEFORE INSERT ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_problem_id();

-- ============================================================================
-- 5. Update log_issue_status to include 'to_verify' status
-- ============================================================================

ALTER TABLE log_issue_status
DROP CONSTRAINT IF EXISTS log_issue_status_status_check;

ALTER TABLE log_issue_status
ADD CONSTRAINT log_issue_status_status_check
CHECK (status IN ('new', 'in_progress', 'to_verify', 'resolved', 'ignored'));

COMMENT ON COLUMN log_issue_status.status IS
'Current issue status: new (unreviewed), in_progress (being worked on), to_verify (fix applied, awaiting verification), resolved (fixed), ignored (not actionable)';

-- ============================================================================
-- 6. Backfill existing error_logs with problem_id
-- ============================================================================

-- Generate problem_ids for existing records ordered by created_at
-- Use a CTE to calculate sequence numbers per day
WITH numbered_logs AS (
    SELECT
        id,
        created_at::date as log_date,
        ROW_NUMBER() OVER (PARTITION BY created_at::date ORDER BY created_at) as seq
    FROM error_logs
    WHERE problem_id IS NULL
)
UPDATE error_logs e
SET problem_id = TO_CHAR(nl.log_date, 'YYYY-MM-DD') || '#' || nl.seq
FROM numbered_logs nl
WHERE e.id = nl.id;

-- Update sequences table to continue from max used per day
INSERT INTO problem_id_sequences (date_key, next_sequence)
SELECT
    created_at::date,
    COUNT(*) + 1
FROM error_logs
WHERE problem_id IS NOT NULL
GROUP BY created_at::date
ON CONFLICT (date_key) DO UPDATE
SET next_sequence = GREATEST(problem_id_sequences.next_sequence, EXCLUDED.next_sequence);

-- ============================================================================
-- 7. Add comment for documentation
-- ============================================================================

COMMENT ON COLUMN error_logs.problem_id IS
'Human-readable problem identifier in format YYYY-MM-DD#N (e.g., 2025-01-13#42). Auto-generated on insert.';

COMMENT ON COLUMN error_logs.environment IS
'Environment where the error occurred: dev (dev.ai.megacampus.ru) or stage (ai.megacampus.ru).';
