-- =============================================================================
-- Migration: Optimize RLS InitPlan Performance
--
-- Date: 2025-01-14
-- Issue: auth.uid() and auth.jwt() are evaluated per-row instead of per-query
-- Solution: Wrap in (SELECT ...) subqueries to force single evaluation
--
-- Impact: 10-100x performance improvement on large table queries
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
--
-- Affected: 38 policies across 9 tables
-- Tables: job_status, organizations, users, courses, sections, lessons,
--         lesson_content, file_catalog, course_enrollments
-- =============================================================================

-- =============================================================================
-- STEP 1: Drop all affected policies
-- =============================================================================

-- JOB_STATUS (10 policies)
DROP POLICY IF EXISTS "admin_job_status_select" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_insert" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_update" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_delete" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_select_org" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_insert" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_update_own" ON job_status;
DROP POLICY IF EXISTS "student_job_status_select_own" ON job_status;
DROP POLICY IF EXISTS "job_status_admin_all" ON job_status;
DROP POLICY IF EXISTS "job_status_instructor_own" ON job_status;
DROP POLICY IF EXISTS "job_status_student_own" ON job_status;

-- ORGANIZATIONS (3 policies)
DROP POLICY IF EXISTS "organizations_admin_all" ON organizations;
DROP POLICY IF EXISTS "organizations_instructor_select" ON organizations;
DROP POLICY IF EXISTS "organizations_student_select" ON organizations;

-- USERS (3 policies)
DROP POLICY IF EXISTS "users_admin_all" ON users;
DROP POLICY IF EXISTS "users_instructor_select" ON users;
DROP POLICY IF EXISTS "users_student_self" ON users;

-- COURSES (4 policies)
DROP POLICY IF EXISTS "courses_admin_all" ON courses;
DROP POLICY IF EXISTS "courses_instructor_own" ON courses;
DROP POLICY IF EXISTS "courses_instructor_view_org" ON courses;
DROP POLICY IF EXISTS "courses_student_enrolled" ON courses;

-- SECTIONS (4 policies)
DROP POLICY IF EXISTS "sections_admin_all" ON sections;
DROP POLICY IF EXISTS "sections_instructor_own" ON sections;
DROP POLICY IF EXISTS "sections_instructor_view_org" ON sections;
DROP POLICY IF EXISTS "sections_student_enrolled" ON sections;

-- LESSONS (4 policies)
DROP POLICY IF EXISTS "lessons_admin_all" ON lessons;
DROP POLICY IF EXISTS "lessons_instructor_own" ON lessons;
DROP POLICY IF EXISTS "lessons_instructor_view_org" ON lessons;
DROP POLICY IF EXISTS "lessons_student_enrolled" ON lessons;

-- LESSON_CONTENT (4 policies)
DROP POLICY IF EXISTS "lesson_content_admin_all" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_instructor_own" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_instructor_view_org" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_student_enrolled" ON lesson_content;

-- FILE_CATALOG (2 policies)
DROP POLICY IF EXISTS "file_catalog_admin_all" ON file_catalog;
DROP POLICY IF EXISTS "file_catalog_instructor_own" ON file_catalog;

-- COURSE_ENROLLMENTS (4 policies)
DROP POLICY IF EXISTS "enrollments_admin_all" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_instructor_view" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_student_select" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_student_update" ON course_enrollments;

-- =============================================================================
-- STEP 2: Recreate policies with optimized auth function calls
-- =============================================================================

-- =============================================================================
-- JOB_STATUS POLICIES (10 policies)
-- Pattern: Wrap auth.uid() with (SELECT auth.uid())
-- =============================================================================

-- Admin can SELECT all job statuses in their organization
CREATE POLICY "admin_job_status_select" ON job_status
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- Admin can INSERT job statuses in their organization
CREATE POLICY "admin_job_status_insert" ON job_status
FOR INSERT WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- Admin can UPDATE job statuses in their organization
CREATE POLICY "admin_job_status_update" ON job_status
FOR UPDATE USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
) WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- Admin can DELETE job statuses in their organization
CREATE POLICY "admin_job_status_delete" ON job_status
FOR DELETE USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- Instructor can SELECT job statuses in their organization
CREATE POLICY "instructor_job_status_select_org" ON job_status
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'instructor'
  )
);

-- Instructor can INSERT their own job statuses
CREATE POLICY "instructor_job_status_insert" ON job_status
FOR INSERT WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'instructor'
  )
  AND (
    course_id IS NULL
    OR course_id IN (
      SELECT id FROM courses
      WHERE user_id = (SELECT auth.uid())
    )
  )
);

-- Instructor can UPDATE their own job statuses
CREATE POLICY "instructor_job_status_update_own" ON job_status
FOR UPDATE USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'instructor'
  )
) WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'instructor'
  )
);

-- Student can SELECT their own job statuses
CREATE POLICY "student_job_status_select_own" ON job_status
FOR SELECT USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'student'
  )
);

-- Admin (JWT-based) - all job statuses in their organization
CREATE POLICY "job_status_admin_all" ON job_status
FOR ALL USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor (JWT-based) - their own job statuses
CREATE POLICY "job_status_instructor_own" ON job_status
FOR ALL USING (
  (
    course_id IN (
      SELECT id FROM courses
      WHERE user_id = (SELECT auth.uid())
    )
    OR course_id IS NULL
  )
  AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student (JWT-based) - their own job statuses
CREATE POLICY "job_status_student_own" ON job_status
FOR ALL USING (
  user_id = (SELECT auth.uid())
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- ORGANIZATIONS POLICIES (3 policies)
-- Pattern: Wrap auth.jwt() with (SELECT auth.jwt())
-- =============================================================================

-- Admin can manage their organization
CREATE POLICY "organizations_admin_all" ON organizations
FOR ALL USING (
  id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can view their organization
CREATE POLICY "organizations_instructor_select" ON organizations
FOR SELECT USING (
  id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view their organization
CREATE POLICY "organizations_student_select" ON organizations
FOR SELECT USING (
  id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- USERS POLICIES (3 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage users in their organization
CREATE POLICY "users_admin_all" ON users
FOR ALL USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can view users in their organization
CREATE POLICY "users_instructor_select" ON users
FOR SELECT USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view their own user record
CREATE POLICY "users_student_self" ON users
FOR ALL USING (
  id = (SELECT auth.uid())
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- COURSES POLICIES (4 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage courses in their organization
CREATE POLICY "courses_admin_all" ON courses
FOR ALL USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can manage their own courses
CREATE POLICY "courses_instructor_own" ON courses
FOR ALL USING (
  user_id = (SELECT auth.uid())
  AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Instructor can view courses in their organization
CREATE POLICY "courses_instructor_view_org" ON courses
FOR SELECT USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view enrolled courses
CREATE POLICY "courses_student_enrolled" ON courses
FOR SELECT USING (
  id IN (
    SELECT course_id FROM course_enrollments
    WHERE user_id = (SELECT auth.uid()) AND status = 'active'
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- SECTIONS POLICIES (4 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage sections in their organization's courses
CREATE POLICY "sections_admin_all" ON sections
FOR ALL USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can manage sections in their own courses
CREATE POLICY "sections_instructor_own" ON sections
FOR ALL USING (
  course_id IN (
    SELECT id FROM courses
    WHERE user_id = (SELECT auth.uid())
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Instructor can view sections in their organization's courses
CREATE POLICY "sections_instructor_view_org" ON sections
FOR SELECT USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view sections in enrolled courses
CREATE POLICY "sections_student_enrolled" ON sections
FOR SELECT USING (
  course_id IN (
    SELECT course_id FROM course_enrollments
    WHERE user_id = (SELECT auth.uid()) AND status = 'active'
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- LESSONS POLICIES (4 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage lessons in their organization's courses
CREATE POLICY "lessons_admin_all" ON lessons
FOR ALL USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can manage lessons in their own courses
CREATE POLICY "lessons_instructor_own" ON lessons
FOR ALL USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.user_id = (SELECT auth.uid())
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Instructor can view lessons in their organization's courses
CREATE POLICY "lessons_instructor_view_org" ON lessons
FOR SELECT USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view lessons in enrolled courses
CREATE POLICY "lessons_student_enrolled" ON lessons
FOR SELECT USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN course_enrollments e ON s.course_id = e.course_id
    WHERE e.user_id = (SELECT auth.uid()) AND e.status = 'active'
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- LESSON_CONTENT POLICIES (4 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage lesson content in their organization's courses
CREATE POLICY "lesson_content_admin_all" ON lesson_content
FOR ALL USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can manage lesson content in their own courses
CREATE POLICY "lesson_content_instructor_own" ON lesson_content
FOR ALL USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.user_id = (SELECT auth.uid())
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Instructor can view lesson content in their organization's courses
CREATE POLICY "lesson_content_instructor_view_org" ON lesson_content
FOR SELECT USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view lesson content in enrolled courses
CREATE POLICY "lesson_content_student_enrolled" ON lesson_content
FOR SELECT USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN course_enrollments e ON s.course_id = e.course_id
    WHERE e.user_id = (SELECT auth.uid()) AND e.status = 'active'
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- FILE_CATALOG POLICIES (2 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage files in their organization
CREATE POLICY "file_catalog_admin_all" ON file_catalog
FOR ALL USING (
  organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can manage files in their own courses
CREATE POLICY "file_catalog_instructor_own" ON file_catalog
FOR ALL USING (
  (
    course_id IN (
      SELECT id FROM courses
      WHERE user_id = (SELECT auth.uid())
    )
    OR course_id IS NULL
  )
  AND organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- =============================================================================
-- COURSE_ENROLLMENTS POLICIES (4 policies)
-- Pattern: Wrap auth.uid() and auth.jwt() with (SELECT ...)
-- =============================================================================

-- Admin can manage enrollments in their organization's courses
CREATE POLICY "enrollments_admin_all" ON course_enrollments
FOR ALL USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'admin'
);

-- Instructor can view enrollments in their own courses
CREATE POLICY "enrollments_instructor_view" ON course_enrollments
FOR SELECT USING (
  course_id IN (
    SELECT id FROM courses
    WHERE user_id = (SELECT auth.uid())
  )
  AND (SELECT (auth.jwt() ->> 'role')) = 'instructor'
);

-- Student can view their own enrollments
CREATE POLICY "enrollments_student_select" ON course_enrollments
FOR SELECT USING (
  user_id = (SELECT auth.uid())
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- Student can update their own enrollments
CREATE POLICY "enrollments_student_update" ON course_enrollments
FOR UPDATE USING (
  user_id = (SELECT auth.uid())
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
) WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (SELECT (auth.jwt() ->> 'role')) = 'student'
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify all policies were recreated successfully
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'job_status', 'organizations', 'users', 'courses',
      'sections', 'lessons', 'lesson_content', 'file_catalog', 'course_enrollments'
    );

  RAISE NOTICE 'Total RLS policies recreated: %', policy_count;

  IF policy_count < 38 THEN
    RAISE WARNING 'Expected at least 38 policies, found only %', policy_count;
  END IF;
END $$;

-- =============================================================================
-- PERFORMANCE VERIFICATION NOTES
-- =============================================================================
--
-- To verify performance improvement, run:
--
-- EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
-- SELECT * FROM courses
-- WHERE organization_id IN (
--   SELECT organization_id FROM users
--   WHERE id = (SELECT auth.uid()) AND role = 'admin'
-- );
--
-- Look for:
-- - "SubPlan" instead of "InitPlan" for auth function calls
-- - Significantly reduced execution time on large tables
-- - Reduced number of function calls in execution plan
--
-- Expected improvement: 10-100x faster on tables with >1000 rows
--
-- =============================================================================
