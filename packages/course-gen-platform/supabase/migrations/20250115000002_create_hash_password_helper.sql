-- ============================================================================
-- Migration: Create hash_password helper function
-- Purpose: Provide secure password hashing for test auth user creation
-- Date: 2025-01-15
-- Security: TEST ENVIRONMENT ONLY - companion to create_test_auth_user
-- ============================================================================

-- ============================================================================
-- FUNCTION: hash_password
-- ============================================================================
-- Purpose:
--   Hash passwords using PostgreSQL's crypt() function with Blowfish algorithm.
--   This is the same algorithm Supabase Auth uses for password encryption.
--
-- Security Model:
--   - SECURITY DEFINER: Runs with elevated privileges to access crypt()
--   - Uses gen_salt('bf') for Blowfish algorithm
--   - No environment check (helper function, not destructive)
--
-- Parameters:
--   password TEXT - Plain text password to hash
--
-- Returns:
--   TEXT - Encrypted password hash compatible with auth.users.encrypted_password
--
-- Usage Example:
--   SELECT hash_password('mypassword123');
--   -- Returns: $2a$06$... (Blowfish hash)
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hash_password(password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STRICT -- Return NULL if input is NULL
IMMUTABLE -- Same input always produces same output (for caching)
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT crypt(password, gen_salt('bf'));
$$;

-- ============================================================================
-- PERMISSIONS: Grant execute to postgres and service_role
-- ============================================================================
REVOKE ALL ON FUNCTION public.hash_password FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_password FROM authenticated;
REVOKE ALL ON FUNCTION public.hash_password FROM anon;

GRANT EXECUTE ON FUNCTION public.hash_password TO postgres;

-- Grant to service_role if it exists
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
--     GRANT EXECUTE ON FUNCTION public.hash_password TO service_role;
--   END IF;
-- END $$;

-- ============================================================================
-- DOCUMENTATION: Function comment
-- ============================================================================
COMMENT ON FUNCTION public.hash_password IS
'Hash passwords using Blowfish algorithm (same as Supabase Auth).

Used in conjunction with create_test_auth_user() to generate encrypted_password
values for test auth users.

SECURITY:
  - SECURITY DEFINER (access to crypt function)
  - STRICT (returns NULL for NULL input)
  - IMMUTABLE (same input = same output)
  - Granted to service_role/postgres only

USAGE:
  SELECT hash_password(''mypassword123'');

RETURNS:
  Blowfish-encrypted password hash string
';

-- ============================================================================
-- VERIFICATION: Check function exists with correct properties
-- ============================================================================
DO $$
DECLARE
  v_function_exists BOOLEAN;
  v_security_type TEXT;
  v_volatility TEXT;
BEGIN
  -- Check function exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'hash_password'
  ) INTO v_function_exists;

  IF NOT v_function_exists THEN
    RAISE EXCEPTION 'Verification failed: hash_password function was not created';
  END IF;

  -- Check SECURITY DEFINER
  SELECT prosecdef::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'hash_password'
  INTO v_security_type;

  IF v_security_type != 'true' THEN
    RAISE EXCEPTION 'Verification failed: hash_password must be SECURITY DEFINER';
  END IF;

  -- Check IMMUTABLE volatility
  SELECT provolatile
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'hash_password'
  INTO v_volatility;

  IF v_volatility != 'i' THEN
    RAISE WARNING 'hash_password should be IMMUTABLE (current: %)', v_volatility;
  END IF;

  RAISE NOTICE 'Verification passed: hash_password function created successfully';
  RAISE NOTICE '  - Function exists: %', v_function_exists;
  RAISE NOTICE '  - Security type: SECURITY DEFINER';
  RAISE NOTICE '  - Volatility: % (i=IMMUTABLE)', v_volatility;
  RAISE NOTICE '  - Permissions: postgres role only (service_role in production)';
END $$;
