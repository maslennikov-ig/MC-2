-- Migration: T035.2 - Update RLS Policies to Support SuperAdmin
-- Task: Enable superadmin cross-organization access across all tables
-- Phase: 2 of 5 (T035.1 through T035.5)
-- Purpose: Update all admin-restricted RLS policies to allow superadmin bypass

-- ============================================================================
-- STRATEGY:
-- ============================================================================
-- SuperAdmin should have FULL access to all tables across ALL organizations.
-- Implementation approaches:
-- 1. For CASE-based policies: Add OR is_superadmin(auth.uid()) to outer condition
-- 2. For EXISTS-based policies: Add OR is_superadmin(auth.uid()) to EXISTS condition
-- 3. Preserve all existing admin/instructor/student logic
-- 4. Apply to both USING and WITH CHECK clauses

-- ============================================================================
-- TABLE 1: organizations
-- ============================================================================
-- Current: Admin can only access their own organization
-- Update: SuperAdmin can access ALL organizations

DROP POLICY IF EXISTS "organizations_all" ON public.organizations;

CREATE POLICY "organizations_all" ON public.organizations
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL organizations
    is_superadmin(auth.uid())
    OR
    -- Original logic: Users can only access their own organization
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'student' THEN id = (auth.jwt() ->> 'organization_id')::uuid
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL organizations
    is_superadmin(auth.uid())
    OR
    -- Original logic: Only admin can modify their own organization
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN id = (auth.jwt() ->> 'organization_id')::uuid
        ELSE false
    END
);

-- ============================================================================
-- TABLE 2: courses
-- ============================================================================
-- Current: Admin/instructor see only org courses, students see enrolled
-- Update: SuperAdmin sees ALL courses across all organizations

DROP POLICY IF EXISTS "courses_all" ON public.courses;

CREATE POLICY "courses_all" ON public.courses
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL courses
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'student' THEN is_enrolled_in_course(auth.uid(), id)
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL courses
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN user_id = auth.uid() AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
        ELSE false
    END
);

-- ============================================================================
-- TABLE 3: sections
-- ============================================================================
-- Current: Admin/instructor limited to org courses
-- Update: SuperAdmin can access ALL sections

DROP POLICY IF EXISTS "sections_all" ON public.sections;

CREATE POLICY "sections_all" ON public.sections
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL sections
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
        WHEN 'instructor' THEN course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
        WHEN 'student' THEN is_enrolled_via_section(auth.uid(), id)
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL sections
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
        WHEN 'instructor' THEN course_belongs_to_user(course_id, auth.uid())
        ELSE false
    END
);

-- ============================================================================
-- TABLE 4: lessons
-- ============================================================================
-- Current: Admin/instructor limited to org courses
-- Update: SuperAdmin can access ALL lessons

DROP POLICY IF EXISTS "lessons_all" ON public.lessons;

CREATE POLICY "lessons_all" ON public.lessons
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL lessons
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN (
            section_belongs_to_user_course(section_id, auth.uid())
            OR EXISTS (
                SELECT 1 FROM sections s
                JOIN courses c ON s.course_id = c.id
                WHERE s.id = lessons.section_id
                AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
            )
        )
        WHEN 'instructor' THEN EXISTS (
            SELECT 1 FROM sections s
            JOIN courses c ON s.course_id = c.id
            WHERE s.id = lessons.section_id
            AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'student' THEN is_enrolled_via_lesson(auth.uid(), id)
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL lessons
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN EXISTS (
            SELECT 1 FROM sections s
            JOIN courses c ON s.course_id = c.id
            WHERE s.id = lessons.section_id
            AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'instructor' THEN section_belongs_to_user_course(section_id, auth.uid())
        ELSE false
    END
);

-- ============================================================================
-- TABLE 5: lesson_content
-- ============================================================================
-- Current: Admin/instructor limited to org courses
-- Update: SuperAdmin can access ALL lesson content

DROP POLICY IF EXISTS "lesson_content_all" ON public.lesson_content;

CREATE POLICY "lesson_content_all" ON public.lesson_content
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL lesson content
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN EXISTS (
            SELECT 1 FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE l.id = lesson_content.lesson_id
            AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'instructor' THEN EXISTS (
            SELECT 1 FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE l.id = lesson_content.lesson_id
            AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'student' THEN is_enrolled_via_lesson(auth.uid(), lesson_id)
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL lesson content
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN EXISTS (
            SELECT 1 FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE l.id = lesson_content.lesson_id
            AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'instructor' THEN lesson_belongs_to_user_course(lesson_id, auth.uid())
        ELSE false
    END
);

-- ============================================================================
-- TABLE 6: course_enrollments
-- ============================================================================
-- Current: Admin limited to org courses
-- Update: SuperAdmin can manage ALL enrollments

DROP POLICY IF EXISTS "course_enrollments_all" ON public.course_enrollments;

CREATE POLICY "course_enrollments_all" ON public.course_enrollments
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL enrollments
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
        WHEN 'instructor' THEN course_belongs_to_user(course_id, auth.uid())
        WHEN 'student' THEN user_id = auth.uid()
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL enrollments
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN course_belongs_to_org(course_id, (auth.jwt() ->> 'organization_id')::uuid)
        WHEN 'student' THEN user_id = auth.uid()
        ELSE false
    END
);

-- ============================================================================
-- TABLE 7: file_catalog
-- ============================================================================
-- Current: Admin limited to org files
-- Update: SuperAdmin can access ALL files

DROP POLICY IF EXISTS "file_catalog_all" ON public.file_catalog;

CREATE POLICY "file_catalog_all" ON public.file_catalog
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL files
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN (
            (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid()) OR course_id IS NULL)
            AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL files
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN (
            (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid()) OR course_id IS NULL)
            AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        ELSE false
    END
);

-- ============================================================================
-- TABLE 8: job_status
-- ============================================================================
-- Current: Admin limited to org jobs
-- Update: SuperAdmin can access ALL jobs

DROP POLICY IF EXISTS "job_status_all" ON public.job_status;

CREATE POLICY "job_status_all" ON public.job_status
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL job statuses
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'student' THEN user_id = auth.uid()
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL job statuses
    is_superadmin(auth.uid())
    OR
    -- Original logic
    CASE (auth.jwt() ->> 'role')
        WHEN 'admin' THEN organization_id = (auth.jwt() ->> 'organization_id')::uuid
        WHEN 'instructor' THEN (
            (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())
             OR course_id IS NULL
             OR user_id = auth.uid())
            AND organization_id = (auth.jwt() ->> 'organization_id')::uuid
        )
        WHEN 'student' THEN user_id = auth.uid()
        ELSE false
    END
);

-- ============================================================================
-- TABLE 9: generation_status_history
-- ============================================================================
-- Current: Admin can read via EXISTS check on users table
-- Update: SuperAdmin can read ALL generation history

DROP POLICY IF EXISTS "generation_history_admin_read" ON public.generation_status_history;

CREATE POLICY "generation_history_admin_read" ON public.generation_status_history
FOR SELECT TO authenticated
USING (
    -- SuperAdmin: Read ALL generation history
    is_superadmin(auth.uid())
    OR
    -- Original logic: Admin can read
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- ============================================================================
-- TABLE 10: system_metrics
-- ============================================================================
-- Current: Admin can read via EXISTS check on users table
-- Update: SuperAdmin can read ALL system metrics

DROP POLICY IF EXISTS "system_metrics_admin_read" ON public.system_metrics;

CREATE POLICY "system_metrics_admin_read" ON public.system_metrics
FOR SELECT TO authenticated
USING (
    -- SuperAdmin: Read ALL system metrics
    is_superadmin(auth.uid())
    OR
    -- Original logic: Admin can read
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid() AND users.role = 'admin'
    )
);

-- ============================================================================
-- TABLE 11: users (SPECIAL CASE)
-- ============================================================================
-- Current: No admin-specific policy, but need to ensure superadmin can manage all users
-- Note: We need to ADD a new policy for superadmin user management

-- Policy: SuperAdmin can read ALL users across organizations
CREATE POLICY "superadmin_users_read" ON public.users
FOR SELECT TO authenticated
USING (
    is_superadmin(auth.uid())
);

-- Policy: SuperAdmin can update ALL users across organizations
CREATE POLICY "superadmin_users_update" ON public.users
FOR UPDATE TO authenticated
USING (
    is_superadmin(auth.uid())
)
WITH CHECK (
    is_superadmin(auth.uid())
);

-- Policy: SuperAdmin can delete users (careful with this one!)
CREATE POLICY "superadmin_users_delete" ON public.users
FOR DELETE TO authenticated
USING (
    is_superadmin(auth.uid())
);

-- ============================================================================
-- VERIFICATION & COMMENTS
-- ============================================================================

-- Add comments to document the superadmin access pattern
COMMENT ON POLICY "organizations_all" ON public.organizations IS
    'RLS policy for organizations: SuperAdmin can access all organizations, others limited to their own org';

COMMENT ON POLICY "courses_all" ON public.courses IS
    'RLS policy for courses: SuperAdmin can access all courses, admin/instructor limited to org, students to enrolled';

COMMENT ON POLICY "sections_all" ON public.sections IS
    'RLS policy for sections: SuperAdmin can access all sections, others limited by course ownership';

COMMENT ON POLICY "lessons_all" ON public.lessons IS
    'RLS policy for lessons: SuperAdmin can access all lessons, others limited by course ownership';

COMMENT ON POLICY "lesson_content_all" ON public.lesson_content IS
    'RLS policy for lesson_content: SuperAdmin can access all content, others limited by course ownership';

COMMENT ON POLICY "course_enrollments_all" ON public.course_enrollments IS
    'RLS policy for enrollments: SuperAdmin can access all enrollments, others limited by org/ownership';

COMMENT ON POLICY "file_catalog_all" ON public.file_catalog IS
    'RLS policy for file_catalog: SuperAdmin can access all files, others limited by org';

COMMENT ON POLICY "job_status_all" ON public.job_status IS
    'RLS policy for job_status: SuperAdmin can access all jobs, others limited by org/ownership';

COMMENT ON POLICY "generation_history_admin_read" ON public.generation_status_history IS
    'RLS policy for generation history: SuperAdmin and admin can read generation history';

COMMENT ON POLICY "system_metrics_admin_read" ON public.system_metrics IS
    'RLS policy for system metrics: SuperAdmin and admin can read system metrics';

COMMENT ON POLICY "superadmin_users_read" ON public.users IS
    'RLS policy for users (read): SuperAdmin can read all users across organizations';

COMMENT ON POLICY "superadmin_users_update" ON public.users IS
    'RLS policy for users (update): SuperAdmin can update all users across organizations';

COMMENT ON POLICY "superadmin_users_delete" ON public.users IS
    'RLS policy for users (delete): SuperAdmin can delete users across organizations';

-- ============================================================================
-- Post-Migration Verification Queries
-- ============================================================================
-- Run these queries after migration to verify superadmin policies work:
--
-- 1. Check all policies updated:
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
--
-- 2. Verify is_superadmin() function exists:
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_superadmin';
--
-- 3. Test superadmin access (see T035.2 testing phase in task description)
