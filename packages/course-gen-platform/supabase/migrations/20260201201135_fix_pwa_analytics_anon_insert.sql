-- Fix PWA Analytics RLS: Allow anonymous users to insert analytics events
-- Problem: Current policy requires authenticated role and user_id = auth.uid()
-- Solution: Allow any user (including anon) to insert with any user_id (including null)

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Authenticated users can insert own pwa analytics" ON pwa_analytics;

-- Create permissive policy for all users (including anonymous)
CREATE POLICY "Anyone can insert pwa analytics"
  ON pwa_analytics FOR INSERT
  WITH CHECK (true);
