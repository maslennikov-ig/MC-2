-- Migration: 20260318160000_add_detect_stuck_generations_cron.sql
-- Purpose: Schedule detect-stuck-generations edge function to run hourly at :30
-- This detects courses stuck in *_generating/*_processing states for 2+ hours
-- and marks them as 'failed' via update_course_progress RPC.
-- Offset to :30 to avoid collision with cleanup-old-drafts at :00.
--
-- Note: This cron job was initially applied via Supabase MCP on 2026-03-18.
-- This migration file ensures reproducibility for new environments.

SELECT cron.schedule(
  'detect-stuck-generations',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://diqooqbuchsliypgwksu.supabase.co/functions/v1/detect-stuck-generations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  )
  $$
);
