-- ============================================================================
-- Migration: Fix set_auth_context function
-- Purpose: Remove SET ROLE command that causes "role 'student' does not exist" error
-- Date: 2025-10-22
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

  -- REMOVED: SET LOCAL role %I (causes "role 'student' does not exist" error)
  -- This command tried to set PostgreSQL role to application role like 'student'
  -- which doesn't exist as a PostgreSQL role

  -- Set JWT claims (affects current transaction only)
  PERFORM set_config('request.jwt.claims', jwt_claims::text, true);

  -- Set request.jwt.claim.sub for auth.uid() compatibility
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_auth_context TO authenticated, anon;

COMMENT ON FUNCTION public.set_auth_context IS
'Test helper function to set PostgreSQL session JWT context for RLS testing.
Sets JWT claims so auth.uid() and auth.jwt() work in test environment.
Effects last only until end of current transaction.
NOTE: Does NOT set PostgreSQL role to avoid conflicts with application roles.';
