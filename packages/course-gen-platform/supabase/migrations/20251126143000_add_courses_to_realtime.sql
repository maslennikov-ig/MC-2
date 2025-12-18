-- =============================================================================
-- Add courses table to Realtime publication
-- Migration: 20251126143000_add_courses_to_realtime
--
-- Problem found:
-- The courses table was NOT in supabase_realtime publication, so generation_status
-- changes were not being broadcast to subscribed clients. This prevented the
-- StageApprovalBanner from appearing when stages reached awaiting_approval state.
-- =============================================================================

-- Add courses to realtime publication (idempotent - will fail silently if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE courses;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table already in publication, ignore
    NULL;
END $$;
