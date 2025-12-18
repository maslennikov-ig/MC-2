-- Migration: Add storage quota management functions
-- Date: 2025-10-15
-- Task: T079 - Vector lifecycle management (helper functions)
-- Description: Adds RPC functions for atomic storage quota updates

-- Function to update organization storage atomically
CREATE OR REPLACE FUNCTION update_organization_storage(
  p_organization_id UUID,
  p_delta_bytes BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organizations
  SET
    storage_used_bytes = GREATEST(storage_used_bytes + p_delta_bytes, 0),
    updated_at = NOW()
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_organization_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION update_organization_storage IS
'Atomically updates organization storage quota. p_delta_bytes can be positive (increment) or negative (decrement). Ensures storage_used_bytes never goes below 0.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_organization_storage TO authenticated;

-- Validation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_organization_storage') THEN
    RAISE EXCEPTION 'Migration failed: update_organization_storage function not created';
  END IF;

  RAISE NOTICE 'Migration 20251015_add_storage_quota_functions.sql completed successfully';
END;
$$;
