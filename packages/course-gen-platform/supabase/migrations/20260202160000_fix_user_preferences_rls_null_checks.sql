-- ============================================================================
-- Migration: 20260202160000_fix_user_preferences_rls_null_checks.sql
-- Purpose: Add explicit NULL checks to RLS policies per Supabase best practices
-- Date: 2026-02-02
-- Issue: mc2-qzxx
-- ============================================================================
--
-- Description:
-- Enhances RLS policies on user_preferences table to include explicit
-- auth.uid() IS NOT NULL checks. While the TO authenticated role restriction
-- provides protection, explicit NULL checks improve debugging and follow
-- Supabase recommended patterns.
--
-- Changes:
-- 1. Drop existing policies
-- 2. Recreate policies with NULL checks
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop existing policies
-- ============================================================================

DROP POLICY IF EXISTS users_select_own_preferences ON public.user_preferences;
DROP POLICY IF EXISTS users_insert_own_preferences ON public.user_preferences;
DROP POLICY IF EXISTS users_update_own_preferences ON public.user_preferences;
DROP POLICY IF EXISTS users_delete_own_preferences ON public.user_preferences;

-- ============================================================================
-- STEP 2: Recreate policies with explicit NULL checks
-- ============================================================================

-- Policy: Users can SELECT their own preferences
CREATE POLICY users_select_own_preferences
    ON public.user_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can INSERT their own preferences
CREATE POLICY users_insert_own_preferences
    ON public.user_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can UPDATE their own preferences
CREATE POLICY users_update_own_preferences
    ON public.user_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can DELETE their own preferences
CREATE POLICY users_delete_own_preferences
    ON public.user_preferences
    FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ============================================================================
-- STEP 3: Update policy comments
-- ============================================================================

COMMENT ON POLICY users_select_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only read their own preferences. Includes explicit NULL check per Supabase best practices.';

COMMENT ON POLICY users_insert_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only insert preferences for themselves. Includes explicit NULL check per Supabase best practices.';

COMMENT ON POLICY users_update_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only update their own preferences. Includes explicit NULL check per Supabase best practices.';

COMMENT ON POLICY users_delete_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only delete their own preferences. Includes explicit NULL check per Supabase best practices.';

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
--
-- 1. Verify policies have NULL checks:
--    SELECT policyname, qual FROM pg_policies
--    WHERE tablename = 'user_preferences';
--
-- 2. Test that authenticated user can access own preferences:
--    SET LOCAL ROLE authenticated;
--    SET LOCAL request.jwt.claims TO '{"sub": "user-uuid"}';
--    SELECT * FROM user_preferences WHERE user_id = 'user-uuid';
--
-- 3. Test that unauthenticated access returns no rows:
--    SET LOCAL ROLE anon;
--    SELECT * FROM user_preferences; -- Should return 0 rows
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
