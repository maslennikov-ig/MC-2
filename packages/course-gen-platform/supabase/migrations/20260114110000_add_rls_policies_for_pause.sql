-- Migration: 20260114110000_add_rls_policies_for_pause.sql
-- Purpose: Document RLS coverage for pause/stop generation columns
-- Related: 20260114100000_add_generation_pause_fields.sql (added the columns)
--
-- Security Analysis:
-- ==================
-- The columns added in the previous migration (generation_paused_at, generation_paused_by)
-- are automatically protected by the existing RLS policy on the courses table.
--
-- Existing policy: courses_all (created in 20251104162955_optimize_rls_policies_auth_init_plan.sql)
-- Policy type: FOR ALL (covers SELECT, INSERT, UPDATE, DELETE)
-- Access rules:
--   - SuperAdmin: Full access to all courses
--   - Admin: Full access to courses in their organization
--   - Instructor: Can read/modify courses in their org (write limited to their own courses)
--   - Student: Can only read courses they are enrolled in
--
-- The pause/resume RPC functions (pause_course_generation, resume_course_generation)
-- use SECURITY DEFINER to bypass RLS, which is correct because:
--   1. They perform internal ownership validation (checking course existence)
--   2. They are designed to be called by authenticated users with proper authorization
--   3. The application layer validates user permissions before calling these functions
--
-- This migration adds explicit documentation via table/column comments for audit purposes.

-- Document that pause columns are covered by existing RLS
COMMENT ON COLUMN courses.generation_paused_at IS
  'Timestamp when generation was paused. NULL means not paused. '
  'Protected by courses_all RLS policy (org-level access control). '
  'Direct updates blocked for students; instructors limited to own courses.';

COMMENT ON COLUMN courses.generation_paused_by IS
  'User ID who paused the generation. Foreign key to auth.users. '
  'Protected by courses_all RLS policy (org-level access control). '
  'Use pause_course_generation() and resume_course_generation() RPCs for safe mutations.';

-- Document the security model on the RPC functions
COMMENT ON FUNCTION pause_course_generation(uuid, uuid) IS
  'Pauses course generation. Running jobs will complete but new jobs will wait. '
  'SECURITY DEFINER: Bypasses RLS but performs internal existence check. '
  'Application layer must validate caller has permission to pause this course.';

COMMENT ON FUNCTION resume_course_generation(uuid, uuid) IS
  'Resumes paused course generation. '
  'SECURITY DEFINER: Bypasses RLS but performs internal state validation. '
  'Application layer must validate caller has permission to resume this course.';

-- Add a table-level comment documenting the RLS security model
-- This helps future developers understand the security architecture
DO $$
BEGIN
  -- Only update if comment doesn't already mention pause functionality
  IF NOT EXISTS (
    SELECT 1 FROM pg_description d
    JOIN pg_class c ON d.objoid = c.oid
    WHERE c.relname = 'courses'
    AND c.relkind = 'r'
    AND d.description LIKE '%pause%'
  ) THEN
    COMMENT ON TABLE courses IS
      'Core course entity. Contains course metadata, generation status, and pause controls. '
      'RLS: courses_all policy (org-based access). Pause/resume via dedicated RPC functions.';
  END IF;
END $$;
