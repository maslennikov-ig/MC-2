-- Migration: 20251022_enhance_superadmin_policies_final.sql
-- Purpose: Enhance remaining policies to ensure superadmin has full cross-org access
-- Task: T035.2 - Final superadmin RLS enhancements

-- ============================================================================
-- PART 1: Enhance generation_status_history policies for superadmin
-- ============================================================================

-- Drop and recreate generation_history_owner_read to include superadmin
DROP POLICY IF EXISTS "generation_history_owner_read" ON generation_status_history;

CREATE POLICY "generation_history_owner_read"
    ON generation_status_history
    FOR SELECT
    USING (
        is_superadmin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE courses.id = generation_status_history.course_id
              AND courses.user_id = auth.uid()
        )
    );

COMMENT ON POLICY "generation_history_owner_read" ON generation_status_history IS
    'Allows course owners and superadmins to read generation status history';

-- ============================================================================
-- PART 2: Enhance users table policies for better superadmin coverage
-- ============================================================================

-- The users table already has dedicated superadmin policies for read/update/delete
-- But we should ensure the "Users can read organization members" policy also allows superadmin

DROP POLICY IF EXISTS "Users can read organization members" ON users;

CREATE POLICY "Users can read organization members"
    ON users
    FOR SELECT
    USING (
        is_superadmin(auth.uid()) OR
        organization_id = get_user_organization_id(auth.uid())
    );

COMMENT ON POLICY "Users can read organization members" ON users IS
    'Allows users to read members of their organization, and superadmins to read all users';

-- ============================================================================
-- PART 3: Add superadmin INSERT policy for users (for user management)
-- ============================================================================

-- Superadmin should be able to create users in any organization
DROP POLICY IF EXISTS "superadmin_users_insert" ON users;

CREATE POLICY "superadmin_users_insert"
    ON users
    FOR INSERT
    WITH CHECK (is_superadmin(auth.uid()));

COMMENT ON POLICY "superadmin_users_insert" ON users IS
    'Allows superadmins to create users in any organization';

-- ============================================================================
-- PART 4: Verify all main tables have superadmin support (idempotent checks)
-- ============================================================================

-- Verify function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'is_superadmin'
    ) THEN
        RAISE EXCEPTION 'is_superadmin() function not found. Run migration 20251022142233 first.';
    END IF;
END $$;

-- Create helper function to check if a policy includes superadmin
CREATE OR REPLACE FUNCTION check_policy_has_superadmin(
    p_table_name text,
    p_policy_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_definition text;
BEGIN
    SELECT qual::text INTO v_definition
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = p_table_name
      AND policyname = p_policy_name;
    
    RETURN v_definition LIKE '%is_superadmin%';
END;
$$;

COMMENT ON FUNCTION check_policy_has_superadmin IS
    'Helper function to verify if a policy includes superadmin check';

-- ============================================================================
-- PART 5: Create summary view for policy audit
-- ============================================================================

CREATE OR REPLACE VIEW v_rls_policy_audit AS
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN qual LIKE '%is_superadmin%' OR with_check LIKE '%is_superadmin%' THEN true
        ELSE false
    END as has_superadmin_access,
    CASE 
        WHEN roles @> ARRAY['authenticated'::name] THEN 'authenticated'
        WHEN roles @> ARRAY['anon'::name] THEN 'anon'
        WHEN roles @> ARRAY['service_role'::name] THEN 'service_role'
        ELSE array_to_string(roles, ', ')
    END as policy_role,
    permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

COMMENT ON VIEW v_rls_policy_audit IS
    'Audit view showing which policies have superadmin access enabled';
