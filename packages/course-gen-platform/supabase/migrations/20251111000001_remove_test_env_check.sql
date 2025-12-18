-- ============================================================================
-- Migration: Remove environment check from create_test_auth_user
-- Purpose: Remove app.environment check that cannot be set in hosted Supabase
-- Date: 2025-11-11
-- Security: Function already secured via GRANT EXECUTE TO postgres only
-- ============================================================================

-- ============================================================================
-- DROP OLD FUNCTION (with 5 parameters)
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_test_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN);

-- ============================================================================
-- FUNCTION: create_test_auth_user (without environment check)
-- ============================================================================
-- Purpose:
--   Creates Supabase Auth users with predefined UUIDs for test stability and idempotency.
--   Includes role parameter to set in JWT claims (raw_app_meta_data).
--
-- Security Model:
--   - SECURITY DEFINER: Runs with elevated privileges to INSERT into auth.users
--   - Postgres role only: Prevents unauthorized access (GRANT EXECUTE TO postgres)
--   - Idempotent: Uses ON CONFLICT to skip existing users
--   - NO environment check: Function security relies on permission grants
--
-- Parameters:
--   p_user_id UUID          - Predefined UUID for the test user
--   p_email TEXT            - User email address
--   p_encrypted_password TEXT - Pre-hashed password (use crypt() function)
--   p_role TEXT             - User role (admin, instructor, student) - for JWT claims
--   p_email_confirmed BOOLEAN - Whether email is confirmed (default: TRUE)
--
-- Returns:
--   JSONB object with:
--     - success: boolean
--     - user_id: UUID (if created)
--     - message: string
--
-- Usage Example:
--   SELECT create_test_auth_user(
--     '00000000-0000-0000-0000-000000000012'::UUID,
--     'test@example.com',
--     crypt('testpass', gen_salt('bf')),
--     'instructor',
--     TRUE
--   );
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_test_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_encrypted_password TEXT,
  p_role TEXT,
  p_email_confirmed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  -- ============================================================================
  -- VALIDATION: Check required parameters
  -- ============================================================================
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;

  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'p_email cannot be NULL or empty';
  END IF;

  IF p_encrypted_password IS NULL OR p_encrypted_password = '' THEN
    RAISE EXCEPTION 'p_encrypted_password cannot be NULL or empty';
  END IF;

  IF p_role IS NULL OR p_role = '' THEN
    RAISE EXCEPTION 'p_role cannot be NULL or empty';
  END IF;

  -- Validate role is one of: admin, instructor, student
  IF p_role NOT IN ('admin', 'instructor', 'student') THEN
    RAISE EXCEPTION 'p_role must be one of: admin, instructor, student. Got: %', p_role;
  END IF;

  -- ============================================================================
  -- INSERT: Create auth user with predefined ID and role metadata
  -- ============================================================================
  -- Insert directly into auth.users table with all required fields
  -- Uses ON CONFLICT to make this function idempotent (safe to call multiple times)

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    aud,
    role,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    p_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID, -- Default instance ID for local/test
    p_email,
    p_encrypted_password,
    CASE WHEN p_email_confirmed THEN NOW() ELSE NULL END,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated',
    jsonb_build_object('role', p_role), -- Set role in JWT claims (app_metadata)
    jsonb_build_object('email', p_email), -- Set email in user_metadata
    '', -- Empty confirmation token (email already confirmed)
    '', -- Empty email change token
    ''  -- Empty recovery token
  )
  ON CONFLICT (id) DO UPDATE SET
    raw_app_meta_data = jsonb_build_object('role', p_role),
    raw_user_meta_data = jsonb_build_object('email', p_email),
    updated_at = NOW()
  RETURNING TRUE INTO v_inserted;

  -- ============================================================================
  -- RETURN: Success response
  -- ============================================================================
  IF v_inserted THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'user_id', p_user_id,
      'email', p_email,
      'role', p_role,
      'message', 'Test auth user created successfully'
    );
  ELSE
    -- User already exists (ON CONFLICT triggered)
    RETURN jsonb_build_object(
      'success', TRUE,
      'user_id', p_user_id,
      'email', p_email,
      'role', p_role,
      'message', 'Test auth user updated successfully (idempotent)'
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- Return error details in JSONB format
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- ============================================================================
-- PERMISSIONS: Grant execute to postgres role for testing
-- ============================================================================
REVOKE ALL ON FUNCTION public.create_test_auth_user FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_test_auth_user FROM authenticated;
REVOKE ALL ON FUNCTION public.create_test_auth_user FROM anon;
GRANT EXECUTE ON FUNCTION public.create_test_auth_user TO postgres;

-- ============================================================================
-- DOCUMENTATION: Function comment
-- ============================================================================
COMMENT ON FUNCTION public.create_test_auth_user IS
'TEST ENVIRONMENT ONLY - Creates Supabase Auth users with predefined UUIDs and role metadata for test fixtures.

SECURITY:
  - SECURITY DEFINER (runs with elevated privileges)
  - Granted to postgres role only (prevents unauthorized access)
  - Idempotent via ON CONFLICT DO UPDATE
  - No environment check (security enforced by permission grants)

USAGE:
  SELECT create_test_auth_user(
    ''00000000-0000-0000-0000-000000000012''::UUID,
    ''test@example.com'',
    crypt(''testpass'', gen_salt(''bf'')),
    ''instructor'',
    TRUE
  );

RETURNS:
  JSONB object with success status, user_id, role, and message

JWT CLAIMS:
  - Sets raw_app_meta_data.role for JWT claims
  - This allows Supabase Auth to include role in JWT tokens
  - Role is then available in auth context and RLS policies

REFERENCE:
  - CVE-2024-10976: SECURITY DEFINER best practices
  - Supabase Auth schema: auth.users table
';

-- ============================================================================
-- VERIFICATION: Check function exists with correct signature
-- ============================================================================
DO $$
DECLARE
  v_function_exists BOOLEAN;
  v_security_type TEXT;
  v_arg_count INT;
BEGIN
  -- Check function exists with 5 parameters
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_test_auth_user'
      AND p.pronargs = 5 -- 5 parameters
  ) INTO v_function_exists;

  IF NOT v_function_exists THEN
    RAISE EXCEPTION 'Verification failed: create_test_auth_user function was not created with correct signature';
  END IF;

  -- Check SECURITY DEFINER
  SELECT prosecdef::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'create_test_auth_user'
  INTO v_security_type;

  IF v_security_type != 'true' THEN
    RAISE EXCEPTION 'Verification failed: create_test_auth_user must be SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Verification passed: create_test_auth_user function created successfully';
  RAISE NOTICE '  - Function exists: %', v_function_exists;
  RAISE NOTICE '  - Security type: SECURITY DEFINER';
  RAISE NOTICE '  - Parameters: 5 (p_user_id, p_email, p_encrypted_password, p_role, p_email_confirmed)';
  RAISE NOTICE '  - Permissions: postgres role only';
  RAISE NOTICE '  - Environment check: REMOVED (security via permission grants)';
  RAISE NOTICE '  - JWT metadata: role set in raw_app_meta_data';
END $$;
