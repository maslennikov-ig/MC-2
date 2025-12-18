-- ============================================================================
-- Migration: Make handle_new_user trigger idempotent
-- Purpose: Add ON CONFLICT clause to prevent duplicate key errors when
--          UPDATE trigger fires for existing users
-- Date: 2025-11-12
-- Investigation: Test failures with "duplicate key value violates unique
--                constraint 'users_pkey'" when auth.users updated
-- ============================================================================

-- ============================================================================
-- ROOT CAUSE:
-- ============================================================================
-- 1. Auth users exist from previous test run
-- 2. Test calls create_test_auth_user() which uses ON CONFLICT DO UPDATE
-- 3. UPDATE triggers on_auth_user_updated
-- 4. Trigger calls handle_new_user()
-- 5. handle_new_user() tries to INSERT into public.users WITHOUT ON CONFLICT
-- 6. Error: duplicate key constraint violation
--
-- SOLUTION:
-- Add ON CONFLICT (id) DO UPDATE to keep public.users in sync with auth.users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_org_id uuid;
BEGIN
  -- Get or create default organization for new users
  SELECT id INTO default_org_id
  FROM public.organizations
  WHERE name = 'Default Organization'
  LIMIT 1;

  -- If no default org exists, create one
  IF default_org_id IS NULL THEN
    INSERT INTO public.organizations (name, tier)
    VALUES ('Default Organization', 'free')
    RETURNING id INTO default_org_id;
  END IF;

  -- Create or update user record in public.users
  -- FIXED: Added ON CONFLICT to make idempotent for UPDATE trigger
  INSERT INTO public.users (id, email, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    default_org_id,
    COALESCE(NEW.raw_app_meta_data->>'role', 'student')::public.role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- ============================================================================
-- VERIFICATION: Test idempotency
-- ============================================================================
DO $$
DECLARE
  v_test_user_id UUID := gen_random_uuid();
  v_test_email TEXT := 'idempotent-test@megacampus.test';
  v_public_user_count INTEGER;
BEGIN
  -- Test 1: INSERT path (should create public.users entry)
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

  -- Verify public.users created
  SELECT COUNT(*) INTO v_public_user_count
  FROM public.users
  WHERE id = v_test_user_id;

  IF v_public_user_count != 1 THEN
    RAISE EXCEPTION 'INSERT verification failed: expected 1 public.users entry, found %', v_public_user_count;
  END IF;

  -- Test 2: UPDATE path (should update public.users, not error)
  UPDATE auth.users
  SET updated_at = NOW(),
      raw_app_meta_data = jsonb_build_object('role', 'admin')
  WHERE id = v_test_user_id;

  -- Verify public.users updated (still 1 entry, role changed)
  SELECT COUNT(*) INTO v_public_user_count
  FROM public.users
  WHERE id = v_test_user_id AND role = 'admin';

  IF v_public_user_count != 1 THEN
    RAISE EXCEPTION 'UPDATE verification failed: expected 1 public.users with role=admin, found %', v_public_user_count;
  END IF;

  -- Test 3: Second UPDATE (should still work)
  UPDATE auth.users
  SET updated_at = NOW(),
      raw_app_meta_data = jsonb_build_object('role', 'student')
  WHERE id = v_test_user_id;

  SELECT COUNT(*) INTO v_public_user_count
  FROM public.users
  WHERE id = v_test_user_id AND role = 'student';

  IF v_public_user_count != 1 THEN
    RAISE EXCEPTION 'Second UPDATE verification failed: expected 1 public.users with role=student, found %', v_public_user_count;
  END IF;

  -- Cleanup
  DELETE FROM public.users WHERE id = v_test_user_id;
  DELETE FROM auth.users WHERE id = v_test_user_id;

  RAISE NOTICE 'Verification passed: handle_new_user() is now idempotent';
  RAISE NOTICE '  ✅ INSERT: creates public.users entry';
  RAISE NOTICE '  ✅ UPDATE: updates existing public.users entry';
  RAISE NOTICE '  ✅ Multiple UPDATEs: all succeed without errors';
END $$;

-- ============================================================================
-- COMMENT: Document the fix
-- ============================================================================
COMMENT ON FUNCTION public.handle_new_user IS
'Trigger function to create/update public.users entry when auth.users is inserted/updated.

FIXED (2025-11-12 16:00):
- Added ON CONFLICT (id) DO UPDATE for idempotency
- Now handles both INSERT and UPDATE triggers without duplicate key errors
- Keeps public.users email and role in sync with auth.users

Reference: Test failures with duplicate key constraint violations
';
