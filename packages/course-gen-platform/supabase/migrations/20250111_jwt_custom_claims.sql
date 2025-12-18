-- ============================================================================
-- Migration: 20250111_jwt_custom_claims.sql
-- Purpose: Add custom JWT claims for role, organization_id, and user_id
-- Author: database-architect
-- Date: 2025-01-11
-- Task: T047 [database-architect] [P] [US3] Configure Supabase Auth custom JWT claims
-- ============================================================================

-- This migration implements the Custom Access Token Hook to enrich JWTs with:
-- 1. user_id - the UUID of the user from public.users table
-- 2. role - the user's role (admin, instructor, or student)
-- 3. organization_id - the organization the user belongs to
--
-- These claims allow the tRPC API to access user context directly from the JWT
-- without additional database queries, improving performance and security.

-- ============================================================================
-- PART 1: CREATE CUSTOM ACCESS TOKEN HOOK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    claims jsonb;
    user_role public.role;
    user_org_id uuid;
    user_email text;
BEGIN
    -- Extract the user_id from the event
    -- The user_id in the event corresponds to auth.users.id

    -- Fetch user data from public.users table
    SELECT role, organization_id, email
    INTO user_role, user_org_id, user_email
    FROM public.users
    WHERE id = (event->>'user_id')::uuid;

    -- Get the existing claims from the event
    claims := event->'claims';

    -- Add custom claims to the JWT
    -- These claims will be accessible in the JWT payload
    IF user_role IS NOT NULL AND user_org_id IS NOT NULL THEN
        -- Set user_id claim (for convenience, though 'sub' already contains auth.users.id)
        claims := jsonb_set(claims, '{user_id}', to_jsonb((event->>'user_id')::uuid));

        -- Set role claim (admin, instructor, or student)
        claims := jsonb_set(claims, '{role}', to_jsonb(user_role));

        -- Set organization_id claim
        claims := jsonb_set(claims, '{organization_id}', to_jsonb(user_org_id));
    ELSE
        -- User doesn't exist in public.users yet (e.g., during initial signup)
        -- Set null values for graceful degradation
        claims := jsonb_set(claims, '{user_id}', 'null'::jsonb);
        claims := jsonb_set(claims, '{role}', 'null'::jsonb);
        claims := jsonb_set(claims, '{organization_id}', 'null'::jsonb);
    END IF;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified event
    RETURN event;
END;
$$;

-- ============================================================================
-- PART 2: GRANT PERMISSIONS TO SUPABASE AUTH ADMIN
-- ============================================================================

-- Grant execute permission to supabase_auth_admin role
-- This is required for Supabase Auth to call the function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Grant usage on the public schema to supabase_auth_admin
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Revoke execute permissions from other roles for security
-- This ensures the function is only callable by Supabase Auth
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================================
-- PART 3: GRANT TABLE ACCESS TO SUPABASE AUTH ADMIN
-- ============================================================================

-- Grant SELECT permission on the users table to supabase_auth_admin
-- This allows the hook function to query user data
GRANT SELECT ON TABLE public.users TO supabase_auth_admin;

-- Create a policy to allow supabase_auth_admin to read from users table
-- This policy ensures the hook can read user data even with RLS enabled
CREATE POLICY "Allow auth admin to read user data for JWT claims"
ON public.users
AS PERMISSIVE
FOR SELECT
TO supabase_auth_admin
USING (true);

-- ============================================================================
-- PART 4: COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.custom_access_token_hook IS
'Custom Access Token Hook that enriches JWTs with user_id, role, and organization_id claims.
Called automatically by Supabase Auth before issuing a JWT token.
Claims are accessible via auth.jwt() in RLS policies and in the client JWT payload.';

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
-- 1. Enable the hook in Supabase Dashboard: Authentication > Hooks (Beta)
--    - Select "custom_access_token_hook" from the dropdown
-- 2. Custom claims will be added to JWTs on:
--    - User sign-in
--    - Token refresh
--    - Session renewal
-- 3. To test: Sign in a user and decode the JWT to verify claims are present
-- 4. Claims will NOT be in the initial auth response, only in the JWT itself
--
-- Example JWT payload after this hook:
-- {
--   "aud": "authenticated",
--   "exp": 1234567890,
--   "sub": "user-uuid",
--   "email": "user@example.com",
--   "user_id": "user-uuid",              // Custom claim
--   "role": "instructor",                 // Custom claim
--   "organization_id": "org-uuid",       // Custom claim
--   ...
-- }
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
