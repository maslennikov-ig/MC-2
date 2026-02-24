-- Migration: 20260124160100_fix_chat_messages_rls_initplan.sql
-- Purpose: Optimize RLS policies to avoid re-evaluating auth.uid() for each row
-- Beads: mc2-9nsr

-- Drop existing policies
DROP POLICY IF EXISTS chat_messages_select_owner ON public.course_chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_owner ON public.course_chat_messages;

-- Recreate with optimized pattern using (select auth.uid()) to cache the value
CREATE POLICY chat_messages_select_owner ON public.course_chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM courses
            WHERE courses.id = course_chat_messages.course_id
              AND courses.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY chat_messages_insert_owner ON public.course_chat_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses
            WHERE courses.id = course_chat_messages.course_id
              AND courses.user_id = (SELECT auth.uid())
        )
    );

COMMENT ON POLICY chat_messages_select_owner ON public.course_chat_messages IS
  'Allows course owners to read their chat messages. Uses (select auth.uid()) for performance.';

COMMENT ON POLICY chat_messages_insert_owner ON public.course_chat_messages IS
  'Allows course owners to insert chat messages. Uses (select auth.uid()) for performance.';
