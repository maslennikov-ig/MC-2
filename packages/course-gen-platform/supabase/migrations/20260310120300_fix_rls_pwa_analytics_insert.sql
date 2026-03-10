-- Fix overly permissive RLS policy on pwa_analytics INSERT
-- "Anyone can insert pwa analytics" uses WITH CHECK(true) for public role
-- pwa_analytics is for anonymous analytics collection, so INSERT from anon is intentional
-- Restrict to anon and authenticated roles explicitly instead of default (public)
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

DROP POLICY IF EXISTS "Anyone can insert pwa analytics" ON public.pwa_analytics;

CREATE POLICY "Anyone can insert pwa analytics"
ON public.pwa_analytics
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
