-- ============================================================================
-- Migration: Test Authentication Context Helper
-- Purpose: Enable auth.uid() in test environment by setting JWT context
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_auth_context(
  user_id uuid,
  user_role text DEFAULT 'authenticated',
  user_email text DEFAULT NULL,
  organization_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  -- Build JWT claims object
  jwt_claims := jsonb_build_object(
    'sub', user_id,
    'role', user_role,
    'email', COALESCE(user_email, user_id::text || '@test.com'),
    'aud', 'authenticated',
    'iat', extract(epoch from now())::integer,
    'exp', extract(epoch from now() + interval '1 hour')::integer
  );

  -- Add custom claims if provided
  IF organization_id IS NOT NULL THEN
    jwt_claims := jwt_claims || jsonb_build_object('organization_id', organization_id);
  END IF;

  -- Set local role (affects current transaction only)
  EXECUTE format('SET LOCAL role %I', user_role);

  -- Set JWT claims (affects current transaction only)
  PERFORM set_config('request.jwt.claims', jwt_claims::text, true);

  -- Set request.jwt.claim.sub for auth.uid() compatibility
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_auth_context TO authenticated, anon;

COMMENT ON FUNCTION public.set_auth_context IS
'Test helper function to set PostgreSQL session JWT context for RLS testing.
Sets local role and JWT claims so auth.uid() works in test environment.
Effects last only until end of current transaction.';

-- ============================================================================
-- Verification Function (Optional - for debugging)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_auth_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_role', current_role,
    'jwt_claims', current_setting('request.jwt.claims', true),
    'auth_uid', auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_auth_context TO authenticated, anon;

COMMENT ON FUNCTION public.get_current_auth_context IS
'Debug helper to verify auth context is set correctly in tests.';
