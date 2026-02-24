-- Migration: Optimize RLS policies by replacing auth.uid() with (SELECT auth.uid())
-- This prevents re-evaluation of auth.uid() for each row, improving performance significantly
-- Reference: Supabase RLS performance best practices

-- ============================================================================
-- 1. course_edits table (2 policies)
-- ============================================================================

-- Drop and recreate "Users can view course edits for their courses" (SELECT)
DROP POLICY IF EXISTS "Users can view course edits for their courses" ON course_edits;
CREATE POLICY "Users can view course edits for their courses" ON course_edits
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_edits.course_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- Drop and recreate "Users can insert course edits for their courses" (INSERT)
DROP POLICY IF EXISTS "Users can insert course edits for their courses" ON course_edits;
CREATE POLICY "Users can insert course edits for their courses" ON course_edits
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = course_edits.course_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- ============================================================================
-- 2. generation_stats table (2 policies)
-- ============================================================================

-- Drop and recreate "Users can view own course stats" (SELECT)
DROP POLICY IF EXISTS "Users can view own course stats" ON generation_stats;
CREATE POLICY "Users can view own course stats" ON generation_stats
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = generation_stats.course_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- Drop and recreate "Instructors can view stats for their organization courses" (SELECT)
DROP POLICY IF EXISTS "Instructors can view stats for their organization courses" ON generation_stats;
CREATE POLICY "Instructors can view stats for their organization courses" ON generation_stats
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN users u ON u.id = (SELECT auth.uid())
            WHERE c.id = generation_stats.course_id
            AND c.organization_id = u.organization_id
            AND u.role = ANY (ARRAY['instructor'::role, 'admin'::role, 'superadmin'::role])
        )
    );

-- ============================================================================
-- 3. generation_status_history table (2 policies)
-- ============================================================================

-- Drop and recreate "generation_history_owner_insert" (INSERT)
DROP POLICY IF EXISTS "generation_history_owner_insert" ON generation_status_history;
CREATE POLICY "generation_history_owner_insert" ON generation_status_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses
            WHERE courses.id = generation_status_history.course_id
            AND courses.user_id = (SELECT auth.uid())
        )
    );

-- Drop and recreate "generation_history_admin_insert" (INSERT)
DROP POLICY IF EXISTS "generation_history_admin_insert" ON generation_status_history;
CREATE POLICY "generation_history_admin_insert" ON generation_status_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = (SELECT auth.uid())
            AND users.role = 'admin'::role
        )
    );

-- ============================================================================
-- 4. generation_trace_archive table (2 policies)
-- ============================================================================

-- Drop and recreate "Users can view own course archive traces" (SELECT)
DROP POLICY IF EXISTS "Users can view own course archive traces" ON generation_trace_archive;
CREATE POLICY "Users can view own course archive traces" ON generation_trace_archive
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = generation_trace_archive.course_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- Drop and recreate "Instructors can view archive traces for their courses" (SELECT)
DROP POLICY IF EXISTS "Instructors can view archive traces for their courses" ON generation_trace_archive;
CREATE POLICY "Instructors can view archive traces for their courses" ON generation_trace_archive
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN users u ON u.id = (SELECT auth.uid())
            WHERE c.id = generation_trace_archive.course_id
            AND c.organization_id = u.organization_id
            AND u.role = ANY (ARRAY['instructor'::role, 'admin'::role, 'superadmin'::role])
        )
    );

-- ============================================================================
-- 5. lesson_improvement_suggestions table (1 policy)
-- ============================================================================

-- Drop and recreate "Users can view improvement suggestions for their courses" (SELECT)
DROP POLICY IF EXISTS "Users can view improvement suggestions for their courses" ON lesson_improvement_suggestions;
CREATE POLICY "Users can view improvement suggestions for their courses" ON lesson_improvement_suggestions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE l.id = lesson_improvement_suggestions.lesson_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- ============================================================================
-- 6. pwa_analytics table (1 policy)
-- ============================================================================

-- Drop and recreate "Admins can read pwa analytics" (SELECT)
DROP POLICY IF EXISTS "Admins can read pwa analytics" ON pwa_analytics;
CREATE POLICY "Admins can read pwa analytics" ON pwa_analytics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = (SELECT auth.uid())
            AND users.role = ANY (ARRAY['admin'::role, 'superadmin'::role])
        )
    );

-- ============================================================================
-- Summary: Optimized 10 RLS policies across 6 tables
-- ============================================================================
-- All policies now use (SELECT auth.uid()) pattern which:
-- 1. Evaluates auth.uid() once per query instead of per row
-- 2. Allows PostgreSQL query planner to optimize better
-- 3. Significantly improves performance on large tables
