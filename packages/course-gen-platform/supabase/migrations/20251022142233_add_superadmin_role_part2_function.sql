-- Migration: T035.1 - Add SuperAdmin Role to Database Schema (Part 2: Helper Function)
-- Task: Create is_superadmin() helper function
-- Phase: 1 of 5 (T035.1 through T035.5)
-- Purpose: Enable cross-organization SuperAdmin role for platform administration

-- ============================================================================
-- STEP 2: Create helper function for RLS policies
-- ============================================================================
-- Function: is_superadmin(user_id uuid)
-- Purpose: Check if a user has the superadmin role
-- Used in: RLS policies (to be added in T035.2)
-- Security: SECURITY INVOKER - runs with caller's permissions
-- Stability: STABLE - result doesn't change within transaction

CREATE OR REPLACE FUNCTION public.is_superadmin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = user_id AND role = 'superadmin'
    );
$$;

-- Add function comment for documentation
COMMENT ON FUNCTION public.is_superadmin(uuid) IS
    'Helper function to check if user has superadmin role. Used in RLS policies for cross-organization access. Returns TRUE if user exists with role=superadmin, FALSE otherwise.';

-- ============================================================================
-- Verification Queries (run these after migration completes)
-- ============================================================================
-- 1. SELECT unnest(enum_range(NULL::role)); -- Should show 4 values
-- 2. SELECT is_superadmin('00000000-0000-0000-0000-000000000000'::uuid); -- Should return false
-- 3. SELECT COUNT(*) FROM users WHERE role = 'superadmin'; -- Should be 0
