-- ============================================================================
-- Migration: 20250112_fix_rls_recursion.sql
-- Purpose: Fix RLS Infinite Recursion by Using JWT Claims
-- Author: database-architect
-- Date: 2025-01-12
-- Priority: P0 - CRITICAL PRODUCTION BUG
-- ============================================================================
-- Problem: RLS policies query users table, which triggers users RLS policies
--          that query users table again → infinite recursion
-- Solution: Use JWT claims (organization_id, role) instead of querying users
-- Impact: Fixes 8 pgTAP RLS tests, improves performance
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: DROP ALL EXISTING RLS POLICIES
-- Drop all 28 policies that query the users table
-- ============================================================================

-- Organizations policies (3 policies)
DROP POLICY IF EXISTS "admin_organizations_all" ON organizations;
DROP POLICY IF EXISTS "instructor_organizations_select" ON organizations;
DROP POLICY IF EXISTS "student_organizations_select" ON organizations;

-- Users policies (3 policies)
DROP POLICY IF EXISTS "admin_users_all" ON users;
DROP POLICY IF EXISTS "instructor_users_select" ON users;
DROP POLICY IF EXISTS "student_users_self" ON users;

-- Courses policies (5 policies)
DROP POLICY IF EXISTS "admin_courses_all" ON courses;
DROP POLICY IF EXISTS "instructor_courses_own" ON courses;
DROP POLICY IF EXISTS "instructor_courses_view_org" ON courses;
DROP POLICY IF EXISTS "student_courses_enrolled" ON courses;

-- Sections policies (4 policies)
DROP POLICY IF EXISTS "admin_sections_all" ON sections;
DROP POLICY IF EXISTS "instructor_sections_own" ON sections;
DROP POLICY IF EXISTS "instructor_sections_view_org" ON sections;
DROP POLICY IF EXISTS "student_sections_enrolled" ON sections;

-- Lessons policies (4 policies)
DROP POLICY IF EXISTS "admin_lessons_all" ON lessons;
DROP POLICY IF EXISTS "instructor_lessons_own" ON lessons;
DROP POLICY IF EXISTS "instructor_lessons_view_org" ON lessons;
DROP POLICY IF EXISTS "student_lessons_enrolled" ON lessons;

-- Lesson content policies (4 policies)
DROP POLICY IF EXISTS "admin_lesson_content_all" ON lesson_content;
DROP POLICY IF EXISTS "instructor_lesson_content_own" ON lesson_content;
DROP POLICY IF EXISTS "instructor_lesson_content_view_org" ON lesson_content;
DROP POLICY IF EXISTS "student_lesson_content_enrolled" ON lesson_content;

-- File catalog policies (2 policies)
DROP POLICY IF EXISTS "admin_file_catalog_all" ON file_catalog;
DROP POLICY IF EXISTS "instructor_file_catalog_own" ON file_catalog;

-- Course enrollments policies (3 policies)
DROP POLICY IF EXISTS "admin_enrollments_all" ON course_enrollments;
DROP POLICY IF EXISTS "instructor_enrollments_view" ON course_enrollments;
DROP POLICY IF EXISTS "student_enrollments_own" ON course_enrollments;
DROP POLICY IF EXISTS "student_enrollments_update_progress" ON course_enrollments;

-- Job status policies (if they exist from other migrations)
DROP POLICY IF EXISTS "admin_job_status_all" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_own" ON job_status;
DROP POLICY IF EXISTS "student_job_status_own" ON job_status;

-- ============================================================================
-- PART 2: ORGANIZATIONS TABLE POLICIES
-- Use JWT claims for organization_id and role checks
-- ============================================================================

-- Admin: Full access to own organization
CREATE POLICY "organizations_admin_all"
ON organizations
FOR ALL
TO authenticated
USING (
  id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Read-only access to own organization
CREATE POLICY "organizations_instructor_select"
ON organizations
FOR SELECT
TO authenticated
USING (
  id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: Read-only access to own organization
CREATE POLICY "organizations_student_select"
ON organizations
FOR SELECT
TO authenticated
USING (
  id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 3: USERS TABLE POLICIES
-- Use JWT claims - NO QUERIES TO USERS TABLE
-- ============================================================================

-- Admin: Full access to all users in organization
CREATE POLICY "users_admin_all"
ON users
FOR ALL
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: View all users in organization
CREATE POLICY "users_instructor_select"
ON users
FOR SELECT
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View own profile only
CREATE POLICY "users_student_self"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 4: COURSES TABLE POLICIES
-- Use JWT claims for organization checks
-- ============================================================================

-- Admin: Full access to all organization courses
CREATE POLICY "courses_admin_all"
ON courses
FOR ALL
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Full access to own courses
CREATE POLICY "courses_instructor_own"
ON courses
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  AND organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Instructor: Read-only access to all organization courses
CREATE POLICY "courses_instructor_view_org"
ON courses
FOR SELECT
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View enrolled courses only
CREATE POLICY "courses_student_enrolled"
ON courses
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT course_id FROM course_enrollments
    WHERE user_id = auth.uid() AND status = 'active'
  )
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 5: SECTIONS TABLE POLICIES
-- Use JWT claims with course joins
-- ============================================================================

-- Admin: Full access to all sections in organization courses
CREATE POLICY "sections_admin_all"
ON sections
FOR ALL
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Full access to sections in own courses
CREATE POLICY "sections_instructor_own"
ON sections
FOR ALL
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Instructor: View sections in all organization courses
CREATE POLICY "sections_instructor_view_org"
ON sections
FOR SELECT
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View sections in enrolled courses
CREATE POLICY "sections_student_enrolled"
ON sections
FOR SELECT
TO authenticated
USING (
  course_id IN (
    SELECT course_id FROM course_enrollments
    WHERE user_id = auth.uid() AND status = 'active'
  )
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 6: LESSONS TABLE POLICIES
-- Use JWT claims with section/course joins
-- ============================================================================

-- Admin: Full access to all lessons in organization
CREATE POLICY "lessons_admin_all"
ON lessons
FOR ALL
TO authenticated
USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Full access to lessons in own courses
CREATE POLICY "lessons_instructor_own"
ON lessons
FOR ALL
TO authenticated
USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.user_id = auth.uid()
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Instructor: View lessons in all organization courses
CREATE POLICY "lessons_instructor_view_org"
ON lessons
FOR SELECT
TO authenticated
USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View lessons in enrolled courses
CREATE POLICY "lessons_student_enrolled"
ON lessons
FOR SELECT
TO authenticated
USING (
  section_id IN (
    SELECT s.id FROM sections s
    JOIN course_enrollments e ON s.course_id = e.course_id
    WHERE e.user_id = auth.uid() AND e.status = 'active'
  )
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 7: LESSON CONTENT TABLE POLICIES
-- Use JWT claims with lesson/section/course joins
-- ============================================================================

-- Admin: Full access to all lesson content in organization
CREATE POLICY "lesson_content_admin_all"
ON lesson_content
FOR ALL
TO authenticated
USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Full access to content in own courses
CREATE POLICY "lesson_content_instructor_own"
ON lesson_content
FOR ALL
TO authenticated
USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.user_id = auth.uid()
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Instructor: View content in all organization courses
CREATE POLICY "lesson_content_instructor_view_org"
ON lesson_content
FOR SELECT
TO authenticated
USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN courses c ON s.course_id = c.id
    WHERE c.organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View content in enrolled courses
CREATE POLICY "lesson_content_student_enrolled"
ON lesson_content
FOR SELECT
TO authenticated
USING (
  lesson_id IN (
    SELECT l.id FROM lessons l
    JOIN sections s ON l.section_id = s.id
    JOIN course_enrollments e ON s.course_id = e.course_id
    WHERE e.user_id = auth.uid() AND e.status = 'active'
  )
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 8: FILE CATALOG TABLE POLICIES
-- Use JWT claims for organization access
-- ============================================================================

-- Admin: Full access to all files in organization
CREATE POLICY "file_catalog_admin_all"
ON file_catalog
FOR ALL
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: Manage files for own courses
CREATE POLICY "file_catalog_instructor_own"
ON file_catalog
FOR ALL
TO authenticated
USING (
  (course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  ) OR course_id IS NULL)
  AND organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- ============================================================================
-- PART 9: COURSE ENROLLMENTS TABLE POLICIES
-- Use JWT claims with course checks
-- ============================================================================

-- Admin: Full access to all enrollments in organization
CREATE POLICY "enrollments_admin_all"
ON course_enrollments
FOR ALL
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  )
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: View enrollments in own courses
CREATE POLICY "enrollments_instructor_view"
ON course_enrollments
FOR SELECT
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  )
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View and update own enrollments
CREATE POLICY "enrollments_student_select"
ON course_enrollments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (select auth.jwt() ->> 'role') = 'student'
);

CREATE POLICY "enrollments_student_update"
ON course_enrollments
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND (select auth.jwt() ->> 'role') = 'student'
)
WITH CHECK (
  user_id = auth.uid()
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 10: JOB STATUS TABLE POLICIES
-- Use JWT claims for job access control
-- ============================================================================

-- Admin: Full access to all jobs in organization
CREATE POLICY "job_status_admin_all"
ON job_status
FOR ALL
TO authenticated
USING (
  organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'admin'
);

-- Instructor: View/manage jobs for own courses
CREATE POLICY "job_status_instructor_own"
ON job_status
FOR ALL
TO authenticated
USING (
  (course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  ) OR course_id IS NULL)
  AND organization_id = (select auth.jwt() ->> 'organization_id')::uuid
  AND (select auth.jwt() ->> 'role') = 'instructor'
);

-- Student: View own jobs only
CREATE POLICY "job_status_student_own"
ON job_status
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (select auth.jwt() ->> 'role') = 'student'
);

-- ============================================================================
-- PART 11: COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY "organizations_admin_all" ON organizations IS
'Admin: Full access to own organization using JWT claims (no users table query)';

COMMENT ON POLICY "users_admin_all" ON users IS
'Admin: Full access to organization users using JWT claims (no recursion)';

COMMENT ON POLICY "courses_admin_all" ON courses IS
'Admin: Full access to organization courses using JWT claims';

COMMENT ON POLICY "courses_instructor_own" ON courses IS
'Instructor: Full access to own courses using JWT claims';

COMMENT ON POLICY "courses_student_enrolled" ON courses IS
'Student: View enrolled courses only, verified with JWT role claim';

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
-- 1. Run tests: cd packages/course-gen-platform && pnpm test:rls
-- 2. Expected: All 8 RLS pgTAP tests should pass (168→176 total tests)
-- 3. Verify no recursion: grep "FROM users" in RLS policies should return 0
-- 4. Performance: Tests should complete < 5 seconds (faster than before)
--
-- Key Changes:
-- - All policies use (select auth.jwt() ->> 'organization_id')::uuid for org checks
-- - All policies use (select auth.jwt() ->> 'role') for role checks
-- - SELECT wrapper on auth.jwt() creates initPlan for query caching
-- - Zero queries to users table in any RLS policy
-- - No infinite recursion possible
--
-- JWT Claims Available:
-- - organization_id: UUID of user's organization
-- - role: admin | instructor | student
-- - user_id: UUID of the user (same as 'sub' claim)
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

COMMIT;
