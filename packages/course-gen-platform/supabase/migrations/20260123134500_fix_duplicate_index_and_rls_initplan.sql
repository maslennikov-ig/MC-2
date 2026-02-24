-- Migration: Fix performance advisor warnings
-- Date: 2026-01-23
-- Issues fixed:
--   1. Duplicate index on lesson_enrichments
--   2. RLS initplan on push_subscriptions

-- ============================================
-- FIX 1: Remove duplicate index
-- lesson_enrichments_lesson_card_unique is identical to lesson_enrichments_lesson_type_unique
-- ============================================
DROP INDEX IF EXISTS lesson_enrichments_lesson_card_unique;

-- ============================================
-- FIX 2: Optimize RLS policy on push_subscriptions
-- Replace auth.uid() with (select auth.uid()) to avoid per-row evaluation
-- ============================================
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON push_subscriptions;

CREATE POLICY "Users can manage their own subscriptions"
ON push_subscriptions
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);
