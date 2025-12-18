-- ============================================================================
-- Migration: 20250111_job_cancellation.sql
-- Purpose: Add custom job cancellation mechanism for BullMQ jobs
-- Author: infrastructure-specialist
-- Date: 2025-01-11
--
-- Context: BullMQ has a limitation - it cannot cancel active (locked) jobs.
-- This migration adds database fields to implement custom cancellation logic
-- that job handlers can check periodically during long-running operations.
-- ============================================================================

-- ============================================================================
-- PART 1: Add cancellation fields to job_status table
-- ============================================================================

-- Add 'cancelled' boolean flag (default: false)
ALTER TABLE job_status
ADD COLUMN cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- Add 'cancelled_at' timestamp (nullable - only set when cancelled=true)
ALTER TABLE job_status
ADD COLUMN cancelled_at TIMESTAMPTZ;

-- Add 'cancelled_by' user reference (nullable - only set when cancelled=true)
ALTER TABLE job_status
ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 2: Add constraints for data integrity
-- ============================================================================

-- If cancelled=true, then cancelled_at must be set
ALTER TABLE job_status
ADD CONSTRAINT job_status_cancelled_timestamp_check CHECK (
    (cancelled = TRUE AND cancelled_at IS NOT NULL) OR
    (cancelled = FALSE)
);

-- If cancelled=true, then cancelled_by should be set (unless system cancellation)
-- This is a soft constraint - we allow NULL cancelled_by for system-initiated cancellations
-- but most cancellations should have a user

-- ============================================================================
-- PART 3: Add indexes for cancellation queries
-- ============================================================================

-- Index for checking cancellation status during job processing
CREATE INDEX idx_job_status_cancelled ON job_status(cancelled) WHERE cancelled = TRUE;

-- Index for finding all cancelled jobs by a specific user
CREATE INDEX idx_job_status_cancelled_by ON job_status(cancelled_by) WHERE cancelled_by IS NOT NULL;

-- Composite index for organization + cancelled status
CREATE INDEX idx_job_status_org_cancelled ON job_status(organization_id, cancelled) WHERE cancelled = TRUE;

-- ============================================================================
-- PART 4: Update RLS policies for cancellation operations
-- ============================================================================

-- Note: Existing SELECT, INSERT, UPDATE policies already cover cancellation fields
-- We just need to ensure users can update the cancelled fields on jobs they own

-- Admins can cancel any job in their organization (via existing admin_job_status_update policy)
-- Instructors can cancel their own jobs (via existing instructor_job_status_update_own policy)
-- Students cannot cancel jobs (no update policy exists for students)

-- No new RLS policies needed - existing policies already handle this correctly

-- ============================================================================
-- PART 5: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN job_status.cancelled IS 'Custom cancellation flag - set to TRUE to request job cancellation. Job handlers should check this periodically during long-running operations.';
COMMENT ON COLUMN job_status.cancelled_at IS 'Timestamp when job cancellation was requested by user or system';
COMMENT ON COLUMN job_status.cancelled_by IS 'User who requested job cancellation (NULL for system-initiated cancellations)';

-- ============================================================================
-- PART 6: Migration verification queries (for testing)
-- ============================================================================

-- Verify new columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_status' AND column_name = 'cancelled'
    ) THEN
        RAISE EXCEPTION 'Migration failed: cancelled column not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_status' AND column_name = 'cancelled_at'
    ) THEN
        RAISE EXCEPTION 'Migration failed: cancelled_at column not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_status' AND column_name = 'cancelled_by'
    ) THEN
        RAISE EXCEPTION 'Migration failed: cancelled_by column not created';
    END IF;

    RAISE NOTICE 'Migration 20250111_job_cancellation.sql applied successfully';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
