-- ============================================================================
-- Migration: Add UPDATE trigger to handle ON CONFLICT path
-- Purpose: Ensure public.users entry is created even when auth.users is
--          updated via ON CONFLICT (test fixtures use idempotent RPC)
-- Date: 2025-11-12
-- Investigation: INV-2025-11-12-002
-- ============================================================================

-- Create trigger for UPDATE events
-- Uses same handle_new_user() function as INSERT trigger
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON TRIGGER on_auth_user_updated ON auth.users IS
'Ensures public.users entry is created even when auth.users is updated via ON CONFLICT.

This handles test fixtures where users are updated instead of inserted due to
the create_test_auth_user RPC function''s ON CONFLICT DO UPDATE clause.

When test cleanup deletes public.users but not auth.users (to avoid race conditions),
subsequent test runs trigger UPDATE instead of INSERT. This trigger ensures
public.users entries are created regardless of which code path is taken.

Reference: INV-2025-11-12-002 - Auth trigger not firing on UPDATE';

-- ============================================================================
-- VERIFICATION: Test that both INSERT and UPDATE paths create public.users
-- ============================================================================
DO $$
DECLARE
  v_test_user_id UUID := gen_random_uuid();
  v_test_email TEXT := 'trigger-test-update@megacampus.test';
  v_public_user_count INTEGER;
BEGIN
  -- Test 1: INSERT path (existing trigger)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_test_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    v_test_email,
    crypt('test123', gen_salt('bf')),
    NOW(),
    jsonb_build_object('role', 'instructor'),
    jsonb_build_object('email', v_test_email),
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
  );

  -- Check public.users was created by INSERT trigger
  SELECT COUNT(*) INTO v_public_user_count
  FROM public.users
  WHERE id = v_test_user_id;

  IF v_public_user_count != 1 THEN
    RAISE EXCEPTION 'INSERT trigger verification failed: expected 1 public.users entry, found %', v_public_user_count;
  END IF;

  -- Delete public.users entry (simulate test cleanup)
  DELETE FROM public.users WHERE id = v_test_user_id;

  -- Test 2: UPDATE path (new trigger)
  UPDATE auth.users
  SET updated_at = NOW(),
      raw_app_meta_data = jsonb_build_object('role', 'instructor')
  WHERE id = v_test_user_id;

  -- Check public.users was created by UPDATE trigger
  SELECT COUNT(*) INTO v_public_user_count
  FROM public.users
  WHERE id = v_test_user_id;

  IF v_public_user_count != 1 THEN
    RAISE EXCEPTION 'UPDATE trigger verification failed: expected 1 public.users entry, found %', v_public_user_count;
  END IF;

  -- Cleanup test data
  DELETE FROM public.users WHERE id = v_test_user_id;
  DELETE FROM auth.users WHERE id = v_test_user_id;

  RAISE NOTICE 'Verification passed: Both INSERT and UPDATE triggers create public.users entries';
END $$;
