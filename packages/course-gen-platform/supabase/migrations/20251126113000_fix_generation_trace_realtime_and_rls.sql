-- =============================================================================
-- Fix generation_trace Realtime and RLS
-- Migration: 20251126113000_fix_generation_trace_realtime_and_rls
--
-- Problems found:
-- 1. generation_trace table was NOT in supabase_realtime publication
-- 2. RLS policy "Course owners can view their traces" used {public} role
--    instead of {authenticated}
-- =============================================================================

-- Step 1: Enable Realtime for generation_trace table
-- This adds the table to supabase_realtime publication so INSERT/UPDATE/DELETE
-- events are broadcast to subscribed clients
ALTER PUBLICATION supabase_realtime ADD TABLE generation_trace;

-- Step 2: Fix RLS policy for course owners
-- Drop the old policy with wrong role
DROP POLICY IF EXISTS "Course owners can view their traces" ON generation_trace;

-- Recreate with authenticated role
CREATE POLICY "Course owners can view their traces"
ON generation_trace
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM courses c
    WHERE c.id = generation_trace.course_id
      AND c.user_id = auth.uid()
  )
);

-- Step 3: Add instructors policy (they should see traces for courses in their org)
DROP POLICY IF EXISTS "Instructors can view traces for their courses" ON generation_trace;

CREATE POLICY "Instructors can view traces for their courses"
ON generation_trace
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM courses c
    JOIN users u ON u.id = auth.uid()
    WHERE c.id = generation_trace.course_id
      AND c.organization_id = u.organization_id
      AND u.role IN ('instructor', 'admin', 'superadmin')
  )
);
