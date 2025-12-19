-- ============================================================================
-- Migration: 20251219130000_add_user_activation.sql
-- Purpose: Add user activation control with is_active boolean field
-- Date: 2025-12-19
-- ============================================================================
--
-- Description:
-- Adds is_active column to users table for user activation control.
-- New users are inactive by default (is_active = false).
-- Only superadmins can manage user activation status.
-- JWT claims are updated to include is_active for frontend/API checks.
--
-- Changes:
-- 1. Add is_active column with DEFAULT false
-- 2. Update existing users to is_active = true (migration-safe)
-- 3. Add RLS policies for superadmin to manage activation
-- 4. Update custom_access_token_hook to include is_active in JWT claims
-- 5. Add index for filtering by activation status
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Add is_active column to users table
-- ============================================================================

-- Add the is_active column with DEFAULT false
-- New users will be inactive by default
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

-- Add comment documenting the column
COMMENT ON COLUMN public.users.is_active IS
    'User activation status. FALSE = inactive (cannot login), TRUE = active. New users are inactive by default and must be activated by superadmin.';

-- ============================================================================
-- STEP 2: Activate all existing users
-- ============================================================================
-- All users who existed before this migration should remain active
-- This ensures no disruption to existing users

UPDATE public.users
SET is_active = true
WHERE is_active = false;

-- ============================================================================
-- STEP 3: Add index for is_active filtering
-- ============================================================================
-- Partial index on inactive users for efficient admin queries
-- Most users will be active, so indexing inactive is more selective

CREATE INDEX IF NOT EXISTS idx_users_inactive
    ON public.users (organization_id, is_active)
    WHERE is_active = false;

-- Full index for general queries filtering by is_active
CREATE INDEX IF NOT EXISTS idx_users_is_active
    ON public.users (is_active);

-- ============================================================================
-- STEP 4: Add RLS policy for superadmin to update user activation
-- ============================================================================
-- The existing superadmin_users_update policy already covers this case,
-- but we add a comment to document that is_active is managed by superadmin

COMMENT ON POLICY "superadmin_users_update" ON public.users IS
    'RLS policy for users (update): SuperAdmin can update all users across organizations, including is_active status for user activation control';

-- ============================================================================
-- STEP 5: Update custom_access_token_hook to include is_active claim
-- ============================================================================
-- This allows the frontend and API to check activation status from JWT
-- without additional database queries

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
    user_is_active boolean;
BEGIN
    -- Extract the user_id from the event
    -- The user_id in the event corresponds to auth.users.id

    -- Fetch user data from public.users table (now including is_active)
    SELECT role, organization_id, email, is_active
    INTO user_role, user_org_id, user_email, user_is_active
    FROM public.users
    WHERE id = (event->>'user_id')::uuid;

    -- Get the existing claims from the event
    claims := event->'claims';

    -- Add custom claims to the JWT
    -- These claims will be accessible in the JWT payload
    IF user_role IS NOT NULL AND user_org_id IS NOT NULL THEN
        -- Set user_id claim (for convenience, though 'sub' already contains auth.users.id)
        claims := jsonb_set(claims, '{user_id}', to_jsonb((event->>'user_id')::uuid));

        -- Set role claim (admin, instructor, student, or superadmin)
        claims := jsonb_set(claims, '{role}', to_jsonb(user_role));

        -- Set organization_id claim
        claims := jsonb_set(claims, '{organization_id}', to_jsonb(user_org_id));

        -- Set is_active claim for frontend/API activation checks
        claims := jsonb_set(claims, '{is_active}', to_jsonb(COALESCE(user_is_active, false)));
    ELSE
        -- User doesn't exist in public.users yet (e.g., during initial signup)
        -- Set null values for graceful degradation
        claims := jsonb_set(claims, '{user_id}', 'null'::jsonb);
        claims := jsonb_set(claims, '{role}', 'null'::jsonb);
        claims := jsonb_set(claims, '{organization_id}', 'null'::jsonb);
        claims := jsonb_set(claims, '{is_active}', 'false'::jsonb);
    END IF;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified event
    RETURN event;
END;
$$;

-- Update function comment to reflect new is_active claim
COMMENT ON FUNCTION public.custom_access_token_hook IS
'Custom Access Token Hook that enriches JWTs with user_id, role, organization_id, and is_active claims.
Called automatically by Supabase Auth before issuing a JWT token.
Claims are accessible via auth.jwt() in RLS policies and in the client JWT payload.
The is_active claim enables frontend/API to check user activation status without database queries.';

-- ============================================================================
-- STEP 6: Create helper function to check if user is active
-- ============================================================================
-- This function can be used in RLS policies if needed in the future

CREATE OR REPLACE FUNCTION public.is_user_active(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT is_active FROM users WHERE id = user_id),
        false
    );
$$;

COMMENT ON FUNCTION public.is_user_active(uuid) IS
    'Helper function to check if user is active. Returns TRUE if user exists and is_active=true, FALSE otherwise. Can be used in RLS policies to restrict inactive users.';

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
--
-- 1. Verify column exists:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'users' AND column_name = 'is_active';
--
-- 2. Verify all existing users are active:
--    SELECT COUNT(*) FROM users WHERE is_active = false;  -- Should be 0
--
-- 3. Verify indexes exist:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname LIKE '%is_active%';
--
-- 4. Test new user creation (should be inactive):
--    INSERT INTO users (id, email, organization_id, role)
--    VALUES (gen_random_uuid(), 'test@example.com', 'some-org-id', 'student');
--    -- is_active should be false
--
-- 5. Verify JWT claims after user login include is_active:
--    Sign in a user and decode the JWT to verify is_active claim is present
--
-- Example JWT payload after this migration:
-- {
--   "aud": "authenticated",
--   "exp": 1234567890,
--   "sub": "user-uuid",
--   "email": "user@example.com",
--   "user_id": "user-uuid",              // Custom claim
--   "role": "instructor",                 // Custom claim
--   "organization_id": "org-uuid",       // Custom claim
--   "is_active": true,                   // NEW: Custom claim
--   ...
-- }
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
