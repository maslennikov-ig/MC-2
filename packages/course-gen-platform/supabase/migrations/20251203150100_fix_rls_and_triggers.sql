-- Migration: Fix RLS policies, add updated_at trigger, and fix backup cleanup race condition
-- Purpose: Address HIGH and MEDIUM priority security and functionality issues
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/security-audit.md
--
-- FIXES:
-- Issue #4 (HIGH): RLS Policy - Version History Access
--   Non-admins can see ALL historical versions of llm_model_config (information leakage).
--   Fix: Restrict non-superadmins to active versions only.
--
-- Issue #9 (MEDIUM): Missing updated_at Trigger
--   llm_model_config lacks auto-update trigger for updated_at column.
--   Fix: Add trigger to auto-update updated_at on row changes.
--
-- Issue #10 (MEDIUM): Backup Cleanup Race Condition
--   cleanup_old_backups() has a race condition in concurrent inserts.
--   Fix: Add advisory lock to prevent concurrent cleanup.

-- ============================================================================
-- FIX #4: Update RLS Policies to Filter Active Versions Only
-- ============================================================================
-- SECURITY ISSUE: Non-superadmins can currently see ALL historical versions
-- of llm_model_config, including potentially sensitive configuration history.
-- This violates the principle of least privilege.
--
-- SOLUTION: Add is_active = true filter to non-superadmin read policies.
-- Superadmins retain access to full version history for auditing purposes.

-- Drop the existing unified read policy
DROP POLICY IF EXISTS "llm_model_config_read_unified" ON llm_model_config;

-- Recreate with active version filtering for non-superadmins
CREATE POLICY "llm_model_config_read_unified"
ON llm_model_config
FOR SELECT
TO authenticated
USING (
  -- Superadmin can read ALL versions (including history) for audit purposes
  EXISTS (
    SELECT 1
    FROM auth.users
    WHERE users.id = (SELECT auth.uid())
      AND (users.raw_user_meta_data->>'role') = 'superadmin'
  )
  OR
  -- Non-superadmins can only read ACTIVE versions of global configs
  (config_type = 'global' AND is_active = true)
  OR
  -- Non-superadmins can only read ACTIVE versions of their org's course overrides
  (
    config_type = 'course_override'
    AND is_active = true
    AND EXISTS (
      SELECT 1
      FROM courses
      WHERE courses.id = llm_model_config.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
    )
  )
);

COMMENT ON POLICY "llm_model_config_read_unified" ON llm_model_config IS
'Unified SELECT policy with version filtering: Superadmins see all versions (for audit), non-superadmins see only active versions. Fixes Issue #4 (information leakage).';

-- ============================================================================
-- FIX #9: Add updated_at Trigger for llm_model_config
-- ============================================================================
-- CONSISTENCY ISSUE: Unlike prompt_templates and pipeline_global_settings,
-- llm_model_config lacks an automatic updated_at trigger. This creates
-- inconsistent audit trails across related tables.
--
-- SOLUTION: Add trigger function and trigger to auto-update updated_at column
-- on any UPDATE operation, matching the pattern used in other admin tables.

CREATE OR REPLACE FUNCTION update_llm_model_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_llm_model_config_updated_at
  BEFORE UPDATE ON llm_model_config
  FOR EACH ROW EXECUTE FUNCTION update_llm_model_config_updated_at();

COMMENT ON FUNCTION update_llm_model_config_updated_at() IS
'Trigger function to auto-update updated_at column on llm_model_config changes. Fixes Issue #9 (missing trigger).';

-- ============================================================================
-- FIX #10: Fix Backup Cleanup Race Condition
-- ============================================================================
-- RACE CONDITION: The cleanup_old_backups() function can be executed
-- concurrently by multiple INSERT operations, leading to:
-- 1. Duplicate DELETE operations scanning the same rows
-- 2. Potential for keeping <20 backups if cleanup overlaps
-- 3. Unnecessary lock contention and performance degradation
--
-- SOLUTION: Use PostgreSQL advisory lock (pg_advisory_xact_lock) to ensure
-- only one cleanup operation runs at a time. The lock is:
-- - Transaction-scoped (auto-released on commit/rollback)
-- - Non-blocking for the INSERT operation (cleanup still succeeds)
-- - Based on a stable hash of the operation name

CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS TRIGGER AS $$
BEGIN
  -- Acquire advisory lock to prevent concurrent cleanup operations
  -- hashtext('config_backups_cleanup') generates a stable int8 for the lock ID
  -- pg_advisory_xact_lock is transaction-scoped and auto-released
  PERFORM pg_advisory_xact_lock(hashtext('config_backups_cleanup'));

  -- Delete all backups beyond the 20 most recent
  -- The lock ensures this DELETE runs serially even with concurrent INSERTs
  DELETE FROM config_backups
  WHERE id IN (
    SELECT id
    FROM config_backups
    ORDER BY created_at DESC
    OFFSET 20
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_backups() IS
'Trigger function to maintain only last 20 config backups. Uses advisory lock to prevent race conditions in concurrent inserts. Fixes Issue #10 (race condition).';

-- ============================================================================
-- Verification Comments
-- ============================================================================

COMMENT ON TABLE llm_model_config IS
'LLM model configurations with versioning. Non-superadmins see only active versions (RLS enforced). updated_at auto-maintained by trigger.';

COMMENT ON TABLE config_backups IS
'Configuration backups for pipeline admin dashboard. Auto-cleaned to keep last 20 (race-safe with advisory lock).';

-- ============================================================================
-- Migration Completion
-- ============================================================================
-- This migration addresses:
-- ✓ Issue #4 (HIGH): RLS version history filtering
-- ✓ Issue #9 (MEDIUM): updated_at trigger for llm_model_config
-- ✓ Issue #10 (MEDIUM): Race-safe backup cleanup
--
-- Post-migration verification:
-- 1. Test non-superadmin users can only see active versions
-- 2. Verify updated_at auto-updates on llm_model_config changes
-- 3. Run concurrent backup inserts to verify no race conditions
