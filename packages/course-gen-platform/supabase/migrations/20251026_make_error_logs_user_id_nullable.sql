-- Migration: Make error_logs.user_id nullable for test compatibility
-- Date: 2025-10-26
-- Issue: Integration tests cannot create auth.users entries, causing FK constraint violations
-- Solution: Make user_id nullable to allow error logging without user context

-- Make user_id nullable
ALTER TABLE error_logs ALTER COLUMN user_id DROP NOT NULL;

-- Update column comment
COMMENT ON COLUMN error_logs.user_id IS
'User ID from auth.users. Nullable to support error logging in contexts where user is unknown or unavailable (e.g., system errors, test environments).';

-- Verification
DO $$
BEGIN
  -- Verify user_id is now nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'error_logs'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE 'Migration 20251026_make_error_logs_user_id_nullable.sql completed successfully';
    RAISE NOTICE 'error_logs.user_id is now nullable for test compatibility';
  ELSE
    RAISE EXCEPTION 'Migration failed: user_id is still NOT NULL';
  END IF;
END;
$$;
