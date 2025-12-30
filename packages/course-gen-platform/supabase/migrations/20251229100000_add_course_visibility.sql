-- Migration: add_course_visibility
-- Purpose: Replace confusing is_published boolean with proper visibility enum
-- This enables granular access control: private, organization, public

-- =============================================================================
-- 1. Create visibility enum type
-- =============================================================================
CREATE TYPE course_visibility AS ENUM ('private', 'organization', 'public');

COMMENT ON TYPE course_visibility IS
  'Course visibility levels: private (owner only), organization (org members), public (all authenticated users)';

-- =============================================================================
-- 2. Add visibility column with default 'private'
-- =============================================================================
ALTER TABLE courses
ADD COLUMN visibility course_visibility NOT NULL DEFAULT 'private';

COMMENT ON COLUMN courses.visibility IS
  'Controls who can view this course. Replaces is_published boolean for more granular control.';

-- =============================================================================
-- 3. Migrate existing data: is_published=true -> visibility='public'
-- =============================================================================
UPDATE courses
SET visibility = 'public'
WHERE is_published = true;

-- =============================================================================
-- 4. Create index on visibility for performance
-- =============================================================================
CREATE INDEX idx_courses_visibility ON courses(visibility);

-- Composite index for common query pattern: org + visibility
CREATE INDEX idx_courses_org_visibility ON courses(organization_id, visibility);

-- =============================================================================
-- 5. Drop existing RLS policy and create updated one
-- =============================================================================
DROP POLICY IF EXISTS courses_all ON courses;

-- New comprehensive RLS policy with visibility support
CREATE POLICY courses_all ON courses FOR ALL
USING (
  -- Superadmin: full access to all courses
  is_superadmin((SELECT auth.uid()))
  OR
  CASE ((SELECT auth.jwt()) ->> 'role')
    -- Admin: all courses in their organization (regardless of visibility)
    WHEN 'admin' THEN
      organization_id = (((SELECT auth.jwt()) ->> 'organization_id')::uuid)

    -- Instructor: all courses in their organization (regardless of visibility)
    WHEN 'instructor' THEN
      organization_id = (((SELECT auth.jwt()) ->> 'organization_id')::uuid)

    -- Student: visibility-based access + enrollment
    WHEN 'student' THEN (
      -- Public courses: visible to all students
      visibility = 'public'
      OR
      -- Organization courses: visible to students in same org
      (visibility = 'organization'
        AND organization_id = (((SELECT auth.jwt()) ->> 'organization_id')::uuid))
      OR
      -- Enrolled courses: always visible regardless of visibility setting
      is_enrolled_in_course((SELECT auth.uid()), id)
    )

    ELSE false
  END
)
WITH CHECK (
  -- Superadmin: can create/edit any course
  is_superadmin((SELECT auth.uid()))
  OR
  CASE ((SELECT auth.jwt()) ->> 'role')
    -- Admin: can create/edit courses in their organization
    WHEN 'admin' THEN
      organization_id = (((SELECT auth.jwt()) ->> 'organization_id')::uuid)

    -- Instructor: can only create/edit their own courses in their organization
    WHEN 'instructor' THEN (
      user_id = (SELECT auth.uid())
      AND organization_id = (((SELECT auth.jwt()) ->> 'organization_id')::uuid)
    )

    -- Students cannot create/edit courses
    ELSE false
  END
);

COMMENT ON POLICY courses_all ON courses IS
  'RLS policy with visibility-based access control. Students see: public courses, org courses (same org), enrolled courses.';

-- =============================================================================
-- 6. Add check constraint to ensure valid visibility transitions (optional)
-- =============================================================================
-- Note: This constraint ensures business logic that only published courses
-- can have public visibility. Commented out for flexibility - uncomment if needed:
-- ALTER TABLE courses ADD CONSTRAINT chk_visibility_status
--   CHECK (visibility != 'public' OR status = 'published');
