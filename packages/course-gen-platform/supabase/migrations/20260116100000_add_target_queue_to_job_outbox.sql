-- ============================================================================
-- Migration: Add target_queue Column to job_outbox
-- Purpose: Enable DEV/Production environment isolation for OutboxProcessor
-- Date: 2026-01-16
-- Issue: mc2-1avq
-- ============================================================================
--
-- Problem:
--   Production and DEV API share the same Supabase database, but use different
--   BullMQ queues:
--   - Production: 'course-generation' (default)
--   - Dev: 'course-generation-dev'
--
--   Race condition: Dev OutboxProcessor could pick up Production outbox entries
--   and create jobs in wrong queue, or vice versa.
--
-- Solution:
--   Add target_queue column to job_outbox table for environment-based filtering.
--   OutboxProcessor filters by target_queue matching its configured queue name.
--
-- ============================================================================

-- ============================================================================
-- Step 1: Add target_queue Column
-- ============================================================================
-- Default: 'course-generation' for backward compatibility with existing entries
-- Constraint: Non-empty string (same validation as queue_name column)

ALTER TABLE job_outbox
ADD COLUMN IF NOT EXISTS target_queue VARCHAR(100)
NOT NULL DEFAULT 'course-generation'
CHECK (length(target_queue) > 0);

-- ============================================================================
-- Step 2: Add Column Comment
-- ============================================================================

COMMENT ON COLUMN job_outbox.target_queue IS
'BullMQ queue name for environment isolation (e.g., course-generation, course-generation-dev). OutboxProcessor filters by this column to prevent cross-environment job pickup.';

-- ============================================================================
-- Step 3: Create Partial Index for Efficient Filtering
-- ============================================================================
-- Index Strategy: Composite index on (target_queue, created_at) for unprocessed entries
-- Use Case: OutboxProcessor polls with WHERE target_queue = $1 AND processed_at IS NULL
-- Performance: Partial index excludes processed entries (smaller index, faster scans)

CREATE INDEX IF NOT EXISTS idx_job_outbox_target_queue_unprocessed
  ON job_outbox(target_queue, created_at)
  WHERE processed_at IS NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Changes:
--   1. Added target_queue column (VARCHAR(100), NOT NULL, DEFAULT 'course-generation')
--   2. Added CHECK constraint for non-empty string
--   3. Added column comment for documentation
--   4. Created partial index for efficient OutboxProcessor filtering
--
-- Backward Compatibility:
--   - Existing rows get default value 'course-generation'
--   - Existing queries without target_queue filter continue working
--   - No changes required to existing OutboxProcessor until code update
--
-- Next Steps:
--   1. Update OutboxProcessor to filter by target_queue
--   2. Update initialize_fsm_with_outbox RPC to accept target_queue parameter
--   3. Update API handlers to pass environment-specific queue name
--
