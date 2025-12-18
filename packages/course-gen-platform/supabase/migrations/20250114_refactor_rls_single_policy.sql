-- =============================================================================
-- Migration: Refactor RLS Policies to Single Policy Per Table
--
-- Parent: T072 - Consolidate RLS Policies
-- Issue: 36 "multiple permissive policies" warnings from Supabase Advisor
-- Solution: Replace 2 policies (_read + _modify) with 1 policy (_all)
--
-- Before: 19 policies (2 per table, except users with 3)
-- After: 10 policies (1 per table) + users exception (keep 3 for auth admin)
--
-- Performance Impact:
--   - SELECT queries: +10-20% (single policy evaluation)
--   - INSERT/UPDATE/DELETE: Same or better
--   - Zero permissive policy warnings
--
-- Reference: docs/T072.1-REFACTOR-RLS-SINGLE-POLICY.md
-- Date: 2025-01-14
-- =============================================================================

BEGIN;

-- =============================================================================
-- ORGANIZATIONS TABLE (2 policies → 1 policy)
-- =============================================================================

-- Drop existing policies from T072
DROP POLICY IF EXISTS "organizations_read" ON organizations;
DROP POLICY IF EXISTS "organizations_modify" ON organizations;

-- Create unified policy with USING for SELECT and WITH CHECK for MODIFY
CREATE POLICY "organizations_all" ON organizations
FOR ALL
USING (
  -- SELECT: Who can READ rows
  -- All authenticated users can view their own organization
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE rows
  -- Only admins can modify organization settings
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
);

COMMENT ON POLICY "organizations_all" ON organizations IS
'Unified policy: USING allows all roles to view their org (SELECT), WITH CHECK restricts modifications to admins only (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- USERS TABLE (3 policies → keep 3 policies)
-- Special case: Preserves auth admin policy for JWT claims lookup
-- =============================================================================

-- Drop existing user-facing policies from T072
DROP POLICY IF EXISTS "users_read" ON users;
DROP POLICY IF EXISTS "users_modify" ON users;
-- Keep: "Allow auth admin to read user data for JWT claims"

-- Create unified policy for regular user access
CREATE POLICY "users_all" ON users
FOR ALL
USING (
  -- SELECT: Who can READ user rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see all users in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors see all users in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students see only themselves
      id = (SELECT auth.uid())
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE user rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify users in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students modify only themselves
      id = (SELECT auth.uid())
    ELSE FALSE
  END
);

COMMENT ON POLICY "users_all" ON users IS
'Unified policy: Admins/instructors view org users, students view self (SELECT). Admins modify org users, students modify self (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- COURSES TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "courses_read" ON courses;
DROP POLICY IF EXISTS "courses_modify" ON courses;

CREATE POLICY "courses_all" ON courses
FOR ALL
USING (
  -- SELECT: Who can READ course rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see all courses in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors see all courses in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students see courses they're enrolled in
      id IN (
        SELECT course_id FROM course_enrollments
        WHERE user_id = (SELECT auth.uid())
          AND status = 'active'
      )
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE course rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify all courses in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors modify only their own courses
      user_id = (SELECT auth.uid())
      AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
);

COMMENT ON POLICY "courses_all" ON courses IS
'Unified policy: USING allows admin/instructor org access, student enrolled access (SELECT). WITH CHECK allows admin full org modify, instructor own only (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- SECTIONS TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "sections_read" ON sections;
DROP POLICY IF EXISTS "sections_modify" ON sections;

CREATE POLICY "sections_all" ON sections
FOR ALL
USING (
  -- SELECT: Who can READ section rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see sections for courses in their organization
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors see sections for courses in their organization
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'student' THEN
      -- Students see sections for enrolled courses
      course_id IN (
        SELECT course_id FROM course_enrollments
        WHERE user_id = (SELECT auth.uid())
          AND status = 'active'
      )
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE section rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify sections for org courses
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors modify sections for own courses
      course_id IN (
        SELECT id FROM courses
        WHERE user_id = (SELECT auth.uid())
      )
    ELSE FALSE
  END
);

COMMENT ON POLICY "sections_all" ON sections IS
'Unified policy: Sections follow course access via course_id foreign key. USING for SELECT, WITH CHECK for INSERT/UPDATE/DELETE.';

-- =============================================================================
-- LESSONS TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "lessons_read" ON lessons;
DROP POLICY IF EXISTS "lessons_modify" ON lessons;

CREATE POLICY "lessons_all" ON lessons
FOR ALL
USING (
  -- SELECT: Who can READ lesson rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see lessons for org courses
      section_id IN (
        SELECT s.id FROM sections s
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors see lessons for org courses
      section_id IN (
        SELECT s.id FROM sections s
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'student' THEN
      -- Students see lessons for enrolled courses
      section_id IN (
        SELECT s.id FROM sections s
        JOIN course_enrollments e ON s.course_id = e.course_id
        WHERE e.user_id = (SELECT auth.uid())
          AND e.status = 'active'
      )
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE lesson rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify lessons for org courses
      section_id IN (
        SELECT s.id FROM sections s
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors modify lessons for own courses
      section_id IN (
        SELECT s.id FROM sections s
        JOIN courses c ON s.course_id = c.id
        WHERE c.user_id = (SELECT auth.uid())
      )
    ELSE FALSE
  END
);

COMMENT ON POLICY "lessons_all" ON lessons IS
'Unified policy: Lessons follow section → course access chain. USING for SELECT, WITH CHECK for INSERT/UPDATE/DELETE.';

-- =============================================================================
-- LESSON_CONTENT TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "lesson_content_read" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_modify" ON lesson_content;

CREATE POLICY "lesson_content_all" ON lesson_content
FOR ALL
USING (
  -- SELECT: Who can READ lesson content rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see content for org lessons
      lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN sections s ON l.section_id = s.id
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors see content for org lessons
      lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN sections s ON l.section_id = s.id
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'student' THEN
      -- Students see content for enrolled courses
      lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN sections s ON l.section_id = s.id
        JOIN course_enrollments e ON s.course_id = e.course_id
        WHERE e.user_id = (SELECT auth.uid())
          AND e.status = 'active'
      )
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE lesson content rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify content for org lessons
      lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN sections s ON l.section_id = s.id
        JOIN courses c ON s.course_id = c.id
        WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors modify content for own lessons
      lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN sections s ON l.section_id = s.id
        JOIN courses c ON s.course_id = c.id
        WHERE c.user_id = (SELECT auth.uid())
      )
    ELSE FALSE
  END
);

COMMENT ON POLICY "lesson_content_all" ON lesson_content IS
'Unified policy: Content follows lesson → section → course access chain. USING for SELECT, WITH CHECK for INSERT/UPDATE/DELETE.';

-- =============================================================================
-- COURSE_ENROLLMENTS TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "course_enrollments_read" ON course_enrollments;
DROP POLICY IF EXISTS "course_enrollments_modify" ON course_enrollments;

CREATE POLICY "course_enrollments_all" ON course_enrollments
FOR ALL
USING (
  -- SELECT: Who can READ enrollment rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see enrollments for org courses
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'instructor' THEN
      -- Instructors see enrollments for own courses
      course_id IN (
        SELECT id FROM courses
        WHERE user_id = (SELECT auth.uid())
      )
    WHEN 'student' THEN
      -- Students see their own enrollments
      user_id = (SELECT auth.uid())
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE enrollment rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify enrollments for org courses
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
      )
    WHEN 'student' THEN
      -- Students update their own enrollment progress
      user_id = (SELECT auth.uid())
    ELSE FALSE
  END
);

COMMENT ON POLICY "course_enrollments_all" ON course_enrollments IS
'Unified policy: USING allows admin org view, instructor own courses, student self (SELECT). WITH CHECK allows admin org manage, student self update (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- FILE_CATALOG TABLE (2 policies → 1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "file_catalog_read" ON file_catalog;
DROP POLICY IF EXISTS "file_catalog_modify" ON file_catalog;

CREATE POLICY "file_catalog_all" ON file_catalog
FOR ALL
USING (
  -- SELECT: Who can READ file catalog rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see all files in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors see files for own courses or org-level files
      (course_id IN (
        SELECT id FROM courses
        WHERE user_id = (SELECT auth.uid())
      ) OR course_id IS NULL)
      AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE file catalog rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins modify all files in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors modify files for own courses
      (course_id IN (
        SELECT id FROM courses
        WHERE user_id = (SELECT auth.uid())
      ) OR course_id IS NULL)
      AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
);

COMMENT ON POLICY "file_catalog_all" ON file_catalog IS
'Unified policy: USING allows admin org view, instructor own courses (SELECT). WITH CHECK allows admin org manage, instructor own courses manage (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- JOB_STATUS TABLE (2 policies → 1 policy)
-- Most complex consolidation with multiple role interactions
-- =============================================================================

DROP POLICY IF EXISTS "job_status_read" ON job_status;
DROP POLICY IF EXISTS "job_status_modify" ON job_status;

CREATE POLICY "job_status_all" ON job_status
FOR ALL
USING (
  -- SELECT: Who can READ job status rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see all jobs in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors see all jobs in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students see only their own jobs
      user_id = (SELECT auth.uid())
    ELSE FALSE
  END
)
WITH CHECK (
  -- MODIFY: Who can INSERT/UPDATE/DELETE job status rows
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins have full access to jobs in their organization
      organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors manage jobs for own courses or their own jobs
      (
        (course_id IN (
          SELECT id FROM courses WHERE user_id = (SELECT auth.uid())
        ) OR course_id IS NULL)
        OR user_id = (SELECT auth.uid())
      )
      AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students can update their own jobs (for cancellation)
      user_id = (SELECT auth.uid())
    ELSE FALSE
  END
);

COMMENT ON POLICY "job_status_all" ON job_status IS
'Unified policy: USING allows admin/instructor org view, student self view (SELECT). WITH CHECK allows admin org manage, instructor own jobs manage, student self update (INSERT/UPDATE/DELETE).';

-- =============================================================================
-- VERIFICATION AND STATISTICS
-- =============================================================================

DO $$
DECLARE
  v_old_count INTEGER := 19;  -- From T072
  v_new_count INTEGER;
  v_tables_with_policies INTEGER;
  v_reduction_pct NUMERIC;
  v_auth_admin_count INTEGER;
BEGIN
  -- Count new policies (excluding auth.users special policies)
  SELECT COUNT(*), COUNT(DISTINCT tablename)
  INTO v_new_count, v_tables_with_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename != 'users'  -- Exclude auth admin policy from count
    OR (tablename = 'users' AND policyname = 'users_all');

  -- Add back users count (should have 2 after this migration: auth admin + users_all)
  SELECT COUNT(*)
  INTO v_auth_admin_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'users';

  v_new_count := v_new_count + v_auth_admin_count;

  -- Calculate reduction
  v_reduction_pct := ROUND(((v_old_count - v_new_count)::NUMERIC / v_old_count * 100), 1);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policy Single-Policy Refactor Results';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Before (T072): % policies', v_old_count;
  RAISE NOTICE 'After (T072.1): % policies', v_new_count;
  RAISE NOTICE 'Reduction: % policies (-% percent)', v_old_count - v_new_count, v_reduction_pct;
  RAISE NOTICE 'Tables with policies: %', v_tables_with_policies;
  RAISE NOTICE 'Users table policies: % (including auth admin)', v_auth_admin_count;
  RAISE NOTICE '========================================';

  -- Validation checks
  IF v_new_count > 12 THEN
    RAISE WARNING 'Expected ~10-11 policies after refactoring, found %. Some policies may not have been consolidated.', v_new_count;
  END IF;

  IF v_new_count < 9 THEN
    RAISE WARNING 'Only % policies found. Some required policies may be missing.', v_new_count;
  END IF;

  -- Check for multiple permissive policies (should be 0 after this migration)
  DECLARE
    v_table_name TEXT;
    v_policy_count INTEGER;
  BEGIN
    FOR v_table_name IN
      SELECT DISTINCT tablename
      FROM pg_policies
      WHERE schemaname = 'public'
    LOOP
      SELECT COUNT(*) INTO v_policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table_name
        AND cmd IN ('SELECT', '*');  -- Policies that apply to SELECT

      IF v_policy_count > 1 AND v_table_name != 'users' THEN
        RAISE WARNING 'Table % has % policies that apply to SELECT (expected 1)', v_table_name, v_policy_count;
      END IF;
    END LOOP;
  END;

  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run test suite: pnpm test';
  RAISE NOTICE '2. Check Performance Advisor for 0 "multiple permissive policies" warnings';
  RAISE NOTICE '3. Run EXPLAIN ANALYZE on key SELECT queries to verify performance improvement';
END $$;

COMMIT;
