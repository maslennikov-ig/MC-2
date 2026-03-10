-- Fix overly permissive RLS policy on clarifying_questions
-- The "clarifying_questions_service_all" policy uses USING(true) WITH CHECK(true) for ALL operations
-- This table is backend-managed, so restrict the ALL policy to service_role only
-- Other policies (admin_select, owner_select, owner_update) remain for authenticated users
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

DROP POLICY IF EXISTS "clarifying_questions_service_all" ON public.clarifying_questions;

CREATE POLICY "clarifying_questions_service_all"
ON public.clarifying_questions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
