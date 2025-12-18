-- =============================================================================
-- Migration: Add TO authenticated Clause to RLS Policies
--
-- Task: T074 - Add TO authenticated Clause to RLS Policies
-- Issue: All 9 policies use {public} role, preventing early exit for anon users
-- Solution: Add TO authenticated to enable early exit optimization
--
-- Impact: 5-10% performance improvement for anonymous access attempts
-- Security: No change - policies already check JWT and return false for anon
-- Testing: 311 tests should pass with no changes
--
-- Changes:
-- - Drop and recreate 9 *_all policies with TO authenticated clause
-- - Preserve exact USING and WITH CHECK logic (no security changes)
-- - Add descriptive COMMENT for each policy
-- - Auth admin policy unchanged (already uses TO supabase_auth_admin)
--
-- Affected Policies:
-- 1. organizations_all
-- 2. users_all
-- 3. courses_all
-- 4. sections_all
-- 5. lessons_all
-- 6. lesson_content_all
-- 7. course_enrollments_all
-- 8. file_catalog_all
-- 9. job_status_all
-- =============================================================================

BEGIN;

-- =============================================================================
-- ORGANIZATIONS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "organizations_all" ON organizations;

CREATE POLICY "organizations_all" ON organizations
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'student'::text THEN (id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    ELSE false
  END
);

COMMENT ON POLICY "organizations_all" ON organizations IS
'Unified policy for all roles with early exit for anonymous users. Only authenticated users can access organizations based on JWT claims.';

-- =============================================================================
-- USERS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "users_all" ON users;

CREATE POLICY "users_all" ON users
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'student'::text THEN (id = ( SELECT auth.uid()))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'student'::text THEN (id = ( SELECT auth.uid()))
    ELSE false
  END
);

COMMENT ON POLICY "users_all" ON users IS
'Unified policy for all roles with early exit for anonymous users. Admins/instructors see org users, students see only themselves.';

-- =============================================================================
-- COURSES POLICY
-- =============================================================================

DROP POLICY IF EXISTS "courses_all" ON courses;

CREATE POLICY "courses_all" ON courses
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'student'::text THEN (id IN (
      SELECT course_id FROM course_enrollments
      WHERE user_id = ( SELECT auth.uid()) AND status = 'active'::enrollment_status
    ))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (
      user_id = ( SELECT auth.uid())
      AND organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    )
    ELSE false
  END
);

COMMENT ON POLICY "courses_all" ON courses IS
'Unified policy for all roles with early exit for anonymous users. Students see enrolled courses, instructors manage their own, admins see all org courses.';

-- =============================================================================
-- SECTIONS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "sections_all" ON sections;

CREATE POLICY "sections_all" ON sections
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'student'::text THEN (course_id IN (
      SELECT course_id FROM course_enrollments
      WHERE user_id = ( SELECT auth.uid()) AND status = 'active'::enrollment_status
    ))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE user_id = ( SELECT auth.uid())
    ))
    ELSE false
  END
);

COMMENT ON POLICY "sections_all" ON sections IS
'Unified policy for all roles with early exit for anonymous users. Access based on course membership and role permissions.';

-- =============================================================================
-- LESSONS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "lessons_all" ON lessons;

CREATE POLICY "lessons_all" ON lessons
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (section_id IN (
      SELECT s.id FROM sections s
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (section_id IN (
      SELECT s.id FROM sections s
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'student'::text THEN (section_id IN (
      SELECT s.id FROM sections s
      JOIN course_enrollments e ON s.course_id = e.course_id
      WHERE e.user_id = ( SELECT auth.uid()) AND e.status = 'active'::enrollment_status
    ))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (section_id IN (
      SELECT s.id FROM sections s
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (section_id IN (
      SELECT s.id FROM sections s
      JOIN courses c ON s.course_id = c.id
      WHERE c.user_id = ( SELECT auth.uid())
    ))
    ELSE false
  END
);

COMMENT ON POLICY "lessons_all" ON lessons IS
'Unified policy for all roles with early exit for anonymous users. Lessons inherit access from section/course hierarchy.';

-- =============================================================================
-- LESSON_CONTENT POLICY
-- =============================================================================

DROP POLICY IF EXISTS "lesson_content_all" ON lesson_content;

CREATE POLICY "lesson_content_all" ON lesson_content
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN sections s ON l.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN sections s ON l.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'student'::text THEN (lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN sections s ON l.section_id = s.id
      JOIN course_enrollments e ON s.course_id = e.course_id
      WHERE e.user_id = ( SELECT auth.uid()) AND e.status = 'active'::enrollment_status
    ))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN sections s ON l.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE c.organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN sections s ON l.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE c.user_id = ( SELECT auth.uid())
    ))
    ELSE false
  END
);

COMMENT ON POLICY "lesson_content_all" ON lesson_content IS
'Unified policy for all roles with early exit for anonymous users. Lesson content inherits access from lesson/section/course hierarchy.';

-- =============================================================================
-- COURSE_ENROLLMENTS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "course_enrollments_all" ON course_enrollments;

CREATE POLICY "course_enrollments_all" ON course_enrollments
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'instructor'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE user_id = ( SELECT auth.uid())
    ))
    WHEN 'student'::text THEN (user_id = ( SELECT auth.uid()))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (course_id IN (
      SELECT id FROM courses
      WHERE organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    ))
    WHEN 'student'::text THEN (user_id = ( SELECT auth.uid()))
    ELSE false
  END
);

COMMENT ON POLICY "course_enrollments_all" ON course_enrollments IS
'Unified policy for all roles with early exit for anonymous users. Students see own enrollments, instructors see enrollments in their courses, admins see org enrollments.';

-- =============================================================================
-- FILE_CATALOG POLICY
-- =============================================================================

DROP POLICY IF EXISTS "file_catalog_all" ON file_catalog;

CREATE POLICY "file_catalog_all" ON file_catalog
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (
      (
        course_id IN (
          SELECT id FROM courses
          WHERE user_id = ( SELECT auth.uid())
        )
        OR course_id IS NULL
      )
      AND organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    )
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (
      (
        course_id IN (
          SELECT id FROM courses
          WHERE user_id = ( SELECT auth.uid())
        )
        OR course_id IS NULL
      )
      AND organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    )
    ELSE false
  END
);

COMMENT ON POLICY "file_catalog_all" ON file_catalog IS
'Unified policy for all roles with early exit for anonymous users. Instructors access files in their courses or org-level files, admins see all org files.';

-- =============================================================================
-- JOB_STATUS POLICY
-- =============================================================================

DROP POLICY IF EXISTS "job_status_all" ON job_status;

CREATE POLICY "job_status_all" ON job_status
FOR ALL TO authenticated  -- ✅ Added TO authenticated for early exit
USING (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'student'::text THEN (user_id = ( SELECT auth.uid()))
    ELSE false
  END
)
WITH CHECK (
  CASE ( SELECT (auth.jwt() ->> 'role'::text))
    WHEN 'admin'::text THEN (organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid))
    WHEN 'instructor'::text THEN (
      (
        course_id IN (
          SELECT id FROM courses
          WHERE user_id = ( SELECT auth.uid())
        )
        OR course_id IS NULL
        OR user_id = ( SELECT auth.uid())
      )
      AND organization_id = ( SELECT ((auth.jwt() ->> 'organization_id'::text))::uuid)
    )
    WHEN 'student'::text THEN (user_id = ( SELECT auth.uid()))
    ELSE false
  END
);

COMMENT ON POLICY "job_status_all" ON job_status IS
'Unified policy for all roles with early exit for anonymous users. Students see own jobs, instructors see jobs in their courses, admins see all org jobs.';

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
--
-- Run these after migration to verify success:
--
-- 1. Check all policies now use {authenticated} role:
-- SELECT tablename, policyname, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND policyname LIKE '%_all'
-- ORDER BY tablename;
--
-- 2. Verify auth admin policy unchanged:
-- SELECT policyname, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'users'
-- AND policyname LIKE '%auth%admin%';
--
-- 3. Check no duplicate policies:
-- SELECT tablename, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- GROUP BY tablename
-- HAVING COUNT(*) > 2;
-- =============================================================================
