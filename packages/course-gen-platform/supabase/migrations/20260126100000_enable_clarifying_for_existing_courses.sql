-- Migration: Enable clarifying questions for existing courses
-- Purpose: Add clarifying_questions_enabled: true to settings for courses created before this feature was enabled
-- Context: Fix 1 from code review - new courses have this flag, but existing ones don't

-- Enable clarifying questions for all existing courses that:
-- 1. Don't already have the flag set
-- 2. Have an active generation (generation_status is not null)
UPDATE courses
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{clarifying_questions_enabled}',
  'true'::jsonb
),
updated_at = NOW()
WHERE settings->>'clarifying_questions_enabled' IS NULL
AND generation_status IS NOT NULL;

-- Also enable for draft courses that haven't started generation yet
-- so they're ready when generation starts
UPDATE courses
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{clarifying_questions_enabled}',
  'true'::jsonb
),
updated_at = NOW()
WHERE settings->>'clarifying_questions_enabled' IS NULL
AND status = 'draft';
