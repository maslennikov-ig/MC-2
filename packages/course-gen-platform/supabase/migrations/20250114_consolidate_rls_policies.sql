-- =============================================================================
-- Migration: Consolidate RLS Policies
-- Date: 2025-01-14
-- Issue: T072 - 40 policies across 9 tables causing maintenance overhead
-- Solution: Consolidate to 1-2 policies per table using role-based CASE logic
-- Reference: Supabase Lint 0006_multiple_permissive_policies
-- Expected Reduction: 40 policies → ~18 policies (-55%)
-- =============================================================================

BEGIN;

-- =============================================================================
-- ORGANIZATIONS TABLE (3 → 1 policy)
-- Current: 3 separate SELECT policies for admin/instructor/student
-- New: 1 unified SELECT policy with role-based CASE
-- =============================================================================

DROP POLICY IF EXISTS "organizations_admin_all" ON organizations;
DROP POLICY IF EXISTS "organizations_instructor_select" ON organizations;
DROP POLICY IF EXISTS "organizations_student_select" ON organizations;

CREATE POLICY "organizations_read" ON organizations
FOR SELECT USING (
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Admins see their own organization
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'instructor' THEN
      -- Instructors see their own organization
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    WHEN 'student' THEN
      -- Students see their own organization
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
);

CREATE POLICY "organizations_modify" ON organizations
FOR ALL USING (
  CASE (SELECT (auth.jwt() ->> 'role'))
    WHEN 'admin' THEN
      -- Only admins can modify their organization
      id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
    ELSE FALSE
  END
);

COMMENT ON POLICY "organizations_read" ON organizations IS
  'All authenticated users can view their own organization';
COMMENT ON POLICY "organizations_modify" ON organizations IS
  'Only admins can modify organization settings';

-- =============================================================================
-- USERS TABLE (4 → 3 policies)
-- Current: 4 policies including special auth admin policy
-- New: Keep auth admin SELECT + 1 unified SELECT + 1 unified MODIFY
-- NOTE: Special "Allow auth admin to read user data for JWT claims" policy preserved
-- =============================================================================

DROP POLICY IF EXISTS "users_admin_all" ON users;
DROP POLICY IF EXISTS "users_instructor_select" ON users;
DROP POLICY IF EXISTS "users_student_self" ON users;
-- Keep: "Allow auth admin to read user data for JWT claims"

CREATE POLICY "users_read" ON users
FOR SELECT USING (
  -- Auth admin policy handles JWT claim lookups, this handles user access
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
);

CREATE POLICY "users_modify" ON users
FOR ALL USING (
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

COMMENT ON POLICY "users_read" ON users IS
  'Admins/instructors view org users; students view self';
COMMENT ON POLICY "users_modify" ON users IS
  'Admins modify org users; students modify self';

-- =============================================================================
-- COURSES TABLE (4 → 2 policies)
-- Current: admin_all, instructor_own, instructor_view_org, student_enrolled
-- New: 1 SELECT + 1 MODIFY
-- =============================================================================

DROP POLICY IF EXISTS "courses_admin_all" ON courses;
DROP POLICY IF EXISTS "courses_instructor_own" ON courses;
DROP POLICY IF EXISTS "courses_instructor_view_org" ON courses;
DROP POLICY IF EXISTS "courses_student_enrolled" ON courses;

CREATE POLICY "courses_read" ON courses
FOR SELECT USING (
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
);

CREATE POLICY "courses_modify" ON courses
FOR ALL USING (
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

COMMENT ON POLICY "courses_read" ON courses IS
  'Admins/instructors view org courses; students view enrolled courses';
COMMENT ON POLICY "courses_modify" ON courses IS
  'Admins modify org courses; instructors modify own courses';

-- =============================================================================
-- SECTIONS TABLE (4 → 2 policies)
-- Current: admin_all, instructor_own, instructor_view_org, student_enrolled
-- New: 1 SELECT + 1 MODIFY
-- =============================================================================

DROP POLICY IF EXISTS "sections_admin_all" ON sections;
DROP POLICY IF EXISTS "sections_instructor_own" ON sections;
DROP POLICY IF EXISTS "sections_instructor_view_org" ON sections;
DROP POLICY IF EXISTS "sections_student_enrolled" ON sections;

CREATE POLICY "sections_read" ON sections
FOR SELECT USING (
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
);

CREATE POLICY "sections_modify" ON sections
FOR ALL USING (
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

COMMENT ON POLICY "sections_read" ON sections IS
  'Admins/instructors view org sections; students view enrolled sections';
COMMENT ON POLICY "sections_modify" ON sections IS
  'Admins modify org sections; instructors modify own sections';

-- =============================================================================
-- LESSONS TABLE (4 → 2 policies)
-- Current: admin_all, instructor_own, instructor_view_org, student_enrolled
-- New: 1 SELECT + 1 MODIFY
-- =============================================================================

DROP POLICY IF EXISTS "lessons_admin_all" ON lessons;
DROP POLICY IF EXISTS "lessons_instructor_own" ON lessons;
DROP POLICY IF EXISTS "lessons_instructor_view_org" ON lessons;
DROP POLICY IF EXISTS "lessons_student_enrolled" ON lessons;

CREATE POLICY "lessons_read" ON lessons
FOR SELECT USING (
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
);

CREATE POLICY "lessons_modify" ON lessons
FOR ALL USING (
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

COMMENT ON POLICY "lessons_read" ON lessons IS
  'Admins/instructors view org lessons; students view enrolled lessons';
COMMENT ON POLICY "lessons_modify" ON lessons IS
  'Admins modify org lessons; instructors modify own lessons';

-- =============================================================================
-- LESSON_CONTENT TABLE (4 → 2 policies)
-- Current: admin_all, instructor_own, instructor_view_org, student_enrolled
-- New: 1 SELECT + 1 MODIFY
-- =============================================================================

DROP POLICY IF EXISTS "lesson_content_admin_all" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_instructor_own" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_instructor_view_org" ON lesson_content;
DROP POLICY IF EXISTS "lesson_content_student_enrolled" ON lesson_content;

CREATE POLICY "lesson_content_read" ON lesson_content
FOR SELECT USING (
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
);

CREATE POLICY "lesson_content_modify" ON lesson_content
FOR ALL USING (
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

COMMENT ON POLICY "lesson_content_read" ON lesson_content IS
  'Admins/instructors view org lesson content; students view enrolled content';
COMMENT ON POLICY "lesson_content_modify" ON lesson_content IS
  'Admins modify org lesson content; instructors modify own content';

-- =============================================================================
-- COURSE_ENROLLMENTS TABLE (4 → 2 policies)
-- Current: admin_all, instructor_view, student_select, student_update
-- New: 1 SELECT + 1 MODIFY
-- =============================================================================

DROP POLICY IF EXISTS "enrollments_admin_all" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_instructor_view" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_student_select" ON course_enrollments;
DROP POLICY IF EXISTS "enrollments_student_update" ON course_enrollments;

CREATE POLICY "course_enrollments_read" ON course_enrollments
FOR SELECT USING (
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
);

CREATE POLICY "course_enrollments_modify" ON course_enrollments
FOR ALL USING (
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

COMMENT ON POLICY "course_enrollments_read" ON course_enrollments IS
  'Admins view org enrollments; instructors view own course enrollments; students view self';
COMMENT ON POLICY "course_enrollments_modify" ON course_enrollments IS
  'Admins manage org enrollments; students update own progress';

-- =============================================================================
-- FILE_CATALOG TABLE (2 → 2 policies)
-- Current: Already optimal with admin_all + instructor_own
-- New: Rename for consistency and add proper comments
-- =============================================================================

DROP POLICY IF EXISTS "file_catalog_admin_all" ON file_catalog;
DROP POLICY IF EXISTS "file_catalog_instructor_own" ON file_catalog;

CREATE POLICY "file_catalog_read" ON file_catalog
FOR SELECT USING (
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
);

CREATE POLICY "file_catalog_modify" ON file_catalog
FOR ALL USING (
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

COMMENT ON POLICY "file_catalog_read" ON file_catalog IS
  'Admins view org files; instructors view own course files';
COMMENT ON POLICY "file_catalog_modify" ON file_catalog IS
  'Admins modify org files; instructors modify own course files';

-- =============================================================================
-- JOB_STATUS TABLE (11 → 2 policies)
-- Current: 11 overlapping policies causing significant overhead
-- New: 1 SELECT + 1 MODIFY consolidating all logic
-- This is the most complex consolidation with highest impact
-- =============================================================================

DROP POLICY IF EXISTS "job_status_admin_all" ON job_status;
DROP POLICY IF EXISTS "job_status_instructor_own" ON job_status;
DROP POLICY IF EXISTS "job_status_student_own" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_select" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_insert" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_update" ON job_status;
DROP POLICY IF EXISTS "admin_job_status_delete" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_select_org" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_insert" ON job_status;
DROP POLICY IF EXISTS "instructor_job_status_update_own" ON job_status;
DROP POLICY IF EXISTS "student_job_status_select_own" ON job_status;

CREATE POLICY "job_status_read" ON job_status
FOR SELECT USING (
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
);

CREATE POLICY "job_status_modify" ON job_status
FOR ALL USING (
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

COMMENT ON POLICY "job_status_read" ON job_status IS
  'Admins/instructors view org jobs; students view own jobs';
COMMENT ON POLICY "job_status_modify" ON job_status IS
  'Admins manage org jobs; instructors manage own jobs; students update own jobs';

-- =============================================================================
-- VERIFICATION AND STATISTICS
-- =============================================================================

DO $$
DECLARE
  v_old_count INTEGER := 40;
  v_new_count INTEGER;
  v_tables_with_policies INTEGER;
  v_reduction_pct NUMERIC;
BEGIN
  -- Count new policies
  SELECT COUNT(*), COUNT(DISTINCT tablename)
  INTO v_new_count, v_tables_with_policies
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Calculate reduction
  v_reduction_pct := ROUND(((v_old_count - v_new_count)::NUMERIC / v_old_count * 100), 1);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policy Consolidation Results';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Before: % policies', v_old_count;
  RAISE NOTICE 'After:  % policies', v_new_count;
  RAISE NOTICE 'Reduction: % policies (-% percent)', v_old_count - v_new_count, v_reduction_pct;
  RAISE NOTICE 'Tables with policies: %', v_tables_with_policies;
  RAISE NOTICE '========================================';

  -- Validation check
  IF v_new_count > 25 THEN
    RAISE WARNING 'Expected ~18-20 policies, found %. Some policies may not have been consolidated.', v_new_count;
  END IF;

  IF v_new_count < 15 THEN
    RAISE WARNING 'Only % policies found. Some required policies may be missing.', v_new_count;
  END IF;

  RAISE NOTICE 'Migration completed successfully!';
END $$;

COMMIT;
