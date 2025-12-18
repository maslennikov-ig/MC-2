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
--
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
--
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
--
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
--
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
--
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
--
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

--
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
--
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
--
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
--
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

--
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
--
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
