-- ============================================================================
-- Migration: 20250112_storage_quota_functions.sql
-- Purpose: Create atomic RPC functions for storage quota management
-- Author: quota-enforcer
-- Date: 2025-01-12
-- ============================================================================

-- ============================================================================
-- ATOMIC INCREMENT FUNCTION
-- ============================================================================

/**
 * Atomically increment organization's storage usage
 *
 * This function provides race-condition-safe storage quota increments.
 * The CHECK constraint on organizations table ensures quota is never exceeded.
 *
 * @param org_id UUID - Organization ID
 * @param size_bytes BIGINT - Bytes to add to storage_used_bytes
 * @returns BOOLEAN - true if successful, false if org not found
 * @throws constraint violation if increment would exceed quota
 */
CREATE OR REPLACE FUNCTION increment_storage_quota(
  org_id UUID,
  size_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'org_id cannot be NULL';
  END IF;

  IF size_bytes IS NULL OR size_bytes <= 0 THEN
    RAISE EXCEPTION 'size_bytes must be a positive number, got: %', size_bytes;
  END IF;

  -- Atomic update with constraint check
  -- The organizations_storage_check constraint ensures:
  -- storage_used_bytes >= 0 AND storage_used_bytes <= storage_quota_bytes
  UPDATE organizations
  SET
    storage_used_bytes = storage_used_bytes + size_bytes,
    updated_at = NOW()
  WHERE id = org_id;

  -- Check if organization was found
  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN FALSE; -- Organization not found
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_storage_quota(UUID, BIGINT) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION increment_storage_quota(UUID, BIGINT) IS
  'Atomically increment organization storage usage. Throws constraint violation if quota exceeded.';

-- ============================================================================
-- ATOMIC DECREMENT FUNCTION
-- ============================================================================

/**
 * Atomically decrement organization's storage usage
 *
 * This function provides race-condition-safe storage quota decrements.
 * Ensures storage_used_bytes never goes negative.
 *
 * @param org_id UUID - Organization ID
 * @param size_bytes BIGINT - Bytes to subtract from storage_used_bytes
 * @returns BOOLEAN - true if successful, false if org not found
 */
CREATE OR REPLACE FUNCTION decrement_storage_quota(
  org_id UUID,
  size_bytes BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
  current_usage BIGINT;
BEGIN
  -- Validate inputs
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'org_id cannot be NULL';
  END IF;

  IF size_bytes IS NULL OR size_bytes <= 0 THEN
    RAISE EXCEPTION 'size_bytes must be a positive number, got: %', size_bytes;
  END IF;

  -- Get current usage for safety check
  SELECT storage_used_bytes INTO current_usage
  FROM organizations
  WHERE id = org_id;

  IF current_usage IS NULL THEN
    RETURN FALSE; -- Organization not found
  END IF;

  -- Atomic update with lower bound check
  -- Use GREATEST to ensure we never go below 0
  UPDATE organizations
  SET
    storage_used_bytes = GREATEST(0, storage_used_bytes - size_bytes),
    updated_at = NOW()
  WHERE id = org_id;

  -- Check if organization was updated
  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_storage_quota(UUID, BIGINT) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION decrement_storage_quota(UUID, BIGINT) IS
  'Atomically decrement organization storage usage. Ensures usage never goes negative.';

-- ============================================================================
-- HELPER FUNCTION: Reset organization storage usage (for testing/admin)
-- ============================================================================

/**
 * Reset organization's storage usage to zero
 *
 * This is a utility function for testing and administrative purposes.
 * Should be restricted to admin users only in production.
 *
 * @param org_id UUID - Organization ID
 * @returns BOOLEAN - true if successful, false if org not found
 */
CREATE OR REPLACE FUNCTION reset_storage_quota(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'org_id cannot be NULL';
  END IF;

  UPDATE organizations
  SET
    storage_used_bytes = 0,
    updated_at = NOW()
  WHERE id = org_id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute permission only to authenticated users
-- In production, you may want to restrict this further to admin role only
GRANT EXECUTE ON FUNCTION reset_storage_quota(UUID) TO authenticated;

COMMENT ON FUNCTION reset_storage_quota(UUID) IS
  'Reset organization storage usage to zero. For testing/admin use only.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
