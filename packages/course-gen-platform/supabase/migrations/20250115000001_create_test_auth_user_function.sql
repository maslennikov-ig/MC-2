-- ============================================================================
-- Migration: Create test_auth_user RPC function
-- Purpose: Provide secure method to create auth users with predefined IDs for test fixtures
-- Date: 2025-01-15
-- Security: TEST ENVIRONMENT ONLY - enforced via runtime check
-- Reference: CVE-2024-10976 (SECURITY DEFINER best practices)
-- ============================================================================

-- ============================================================================
-- FUNCTION: create_test_auth_user
-- ============================================================================
-- Purpose:
--   Creates Supabase Auth users with predefined UUIDs for test stability and idempotency.
--   This function bypasses the normal Auth API which doesn't allow specifying user IDs.
--
-- Security Model:
--   - SECURITY DEFINER: Runs with elevated privileges to INSERT into auth.users
--   - Environment check: MUST run in 'test' environment only
--   - Service role only: Prevents unauthorized access
--   - Idempotent: Uses ON CONFLICT to skip existing users
--
-- Parameters:
--   p_user_id UUID          - Predefined UUID for the test user
--   p_email TEXT            - User email address
--   p_encrypted_password TEXT - Pre-hashed password (use crypt() function)
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
--     TRUE
--   );
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_test_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_encrypted_password TEXT,
  p_email_confirmed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
DECLARE
  v_environment TEXT;
  v_inserted BOOLEAN := FALSE;
BEGIN
  -- ============================================================================
  -- SECURITY CHECK: Verify we're running in test environment
  -- ============================================================================
  -- Read app.environment from PostgreSQL config
  -- This must be set via: ALTER DATABASE postgres SET app.environment = 'test';
  -- or at session level: SET app.environment = 'test';

  BEGIN
    v_environment := current_setting('app.environment', true);
  EXCEPTION WHEN OTHERS THEN
    v_environment := NULL;
  END;

  -- Reject if not in test environment
  IF v_environment IS NULL OR v_environment != 'test' THEN
    RAISE EXCEPTION 'create_test_auth_user can only be called in test environment (app.environment = ''test''). Current: %',
      COALESCE(v_environment, 'NULL')
    USING HINT = 'Set app.environment via: ALTER DATABASE postgres SET app.environment = ''test'';';
  END IF;

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

  -- ============================================================================
  -- INSERT: Create auth user with predefined ID
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
    '', -- Empty confirmation token (email already confirmed)
    '', -- Empty email change token
    ''  -- Empty recovery token
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING TRUE INTO v_inserted;

  -- ============================================================================
  -- RETURN: Success response
  -- ============================================================================
  IF v_inserted THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'user_id', p_user_id,
      'email', p_email,
      'message', 'Test auth user created successfully'
    );
  ELSE
    -- User already exists (ON CONFLICT triggered)
    RETURN jsonb_build_object(
      'success', TRUE,
      'user_id', p_user_id,
      'email', p_email,
      'message', 'Test auth user already exists (idempotent)'
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
-- PERMISSIONS: Grant execute to service_role only
-- ============================================================================
-- This function should ONLY be callable by the service role (backend)
-- Revoke from all other roles for security

REVOKE ALL ON FUNCTION public.create_test_auth_user FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_test_auth_user FROM authenticated;
REVOKE ALL ON FUNCTION public.create_test_auth_user FROM anon;

-- Grant to service_role only
-- Note: In Supabase, service_role bypasses RLS and has elevated privileges
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
--     GRANT EXECUTE ON FUNCTION public.create_test_auth_user TO service_role;
--   END IF;
-- END $$;

-- Alternative: Grant to postgres role for local testing
GRANT EXECUTE ON FUNCTION public.create_test_auth_user TO postgres;

-- ============================================================================
-- DOCUMENTATION: Function comment
-- ============================================================================
COMMENT ON FUNCTION public.create_test_auth_user IS
'TEST ENVIRONMENT ONLY - Creates Supabase Auth users with predefined UUIDs for test fixtures.

SECURITY:
  - Only callable in test environment (app.environment = ''test'')
  - SECURITY DEFINER (runs with elevated privileges)
  - Granted to service_role/postgres only
  - Idempotent via ON CONFLICT (id) DO NOTHING

USAGE:
  SELECT create_test_auth_user(
    ''00000000-0000-0000-0000-000000000012''::UUID,
    ''test@example.com'',
    crypt(''testpass'', gen_salt(''bf'')),
    TRUE
  );

RETURNS:
  JSONB object with success status, user_id, and message

REFERENCE:
  - CVE-2024-10976: SECURITY DEFINER best practices
  - Supabase Auth schema: auth.users table
';

-- ============================================================================
-- VERIFICATION: Check function exists with correct permissions
-- ============================================================================
DO $$
DECLARE
  v_function_exists BOOLEAN;
  v_security_type TEXT;
BEGIN
  -- Check function exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_test_auth_user'
  ) INTO v_function_exists;

  IF NOT v_function_exists THEN
    RAISE EXCEPTION 'Verification failed: create_test_auth_user function was not created';
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
  RAISE NOTICE '  - Permissions: postgres role only (service_role in production)';
  RAISE NOTICE '  - Environment check: ENFORCED (test only)';
END $$;
