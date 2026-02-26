-- ============================================================================
-- Migration: 20260115000000_add_generation_mode.sql
-- Purpose: Add automatic generation mode support with notification preferences
-- Date: 2026-01-15
-- ============================================================================
--
-- Description:
-- Adds support for automatic course generation mode where stages can proceed
-- without manual user approval. Includes notification preferences for
-- completion, errors, and stage completion events.
--
-- Changes:
-- 1. Add generation_mode column to courses ('automatic' | 'semi_automatic')
-- 2. Add notification preference columns (notify_on_completion, etc.)
-- 3. Add estimated_cost_usd for cost tracking
-- 4. Add telegram notification settings to users table
-- 5. Add index for finding automatic generation courses
-- 6. Add documentation comments
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Add generation_mode column to courses table
-- ============================================================================

-- Add generation_mode column with constraint for valid values
-- Default is 'semi_automatic' for backward compatibility with existing courses
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'semi_automatic'
    CONSTRAINT courses_generation_mode_check CHECK (generation_mode IN ('automatic', 'semi_automatic'));

-- Add documentation comment
COMMENT ON COLUMN public.courses.generation_mode IS
    'Generation mode: automatic = no user approval needed between stages; semi_automatic = requires stage approvals (default)';

-- ============================================================================
-- STEP 2: Add notification preference columns to courses table
-- ============================================================================

-- Notify when course generation completes successfully
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS notify_on_completion BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.courses.notify_on_completion IS
    'Send notification when course generation completes successfully';

-- Notify when an error occurs during generation
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS notify_on_error BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.courses.notify_on_error IS
    'Send notification when an error occurs during course generation';

-- Notify when each stage completes (more granular, off by default)
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS notify_on_stage_complete BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.courses.notify_on_stage_complete IS
    'Send notification when each pipeline stage completes (granular updates)';

-- ============================================================================
-- STEP 3: Add estimated cost tracking column
-- ============================================================================

-- Estimated cost in USD for the course generation
-- NUMERIC(10,4) allows for values up to 999,999.9999 with 4 decimal precision
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,4) DEFAULT NULL;

COMMENT ON COLUMN public.courses.estimated_cost_usd IS
    'Estimated LLM API cost in USD for generating this course. Updated during/after generation.';

-- ============================================================================
-- STEP 4: Add Telegram notification settings to users table
-- ============================================================================

-- Telegram chat ID for sending notifications
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.users.telegram_chat_id IS
    'Telegram chat ID for receiving course generation notifications. Obtained via Telegram bot.';

-- Whether Telegram notifications are enabled for this user
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.users.telegram_notifications_enabled IS
    'Whether user has enabled Telegram notifications. Requires telegram_chat_id to be set.';

-- ============================================================================
-- STEP 5: Add indexes for performance
-- ============================================================================

-- Partial index for finding courses in automatic generation mode
-- This is useful for background workers processing automatic courses
CREATE INDEX IF NOT EXISTS idx_courses_generation_mode
    ON public.courses(generation_mode)
    WHERE generation_mode = 'automatic';

-- Index on users with Telegram enabled for notification dispatch
CREATE INDEX IF NOT EXISTS idx_users_telegram_enabled
    ON public.users(telegram_notifications_enabled)
    WHERE telegram_notifications_enabled = true;

-- ============================================================================
-- STEP 6: Update existing courses (if needed)
-- ============================================================================
-- All existing courses get semi_automatic mode (the default)
-- This is handled by the DEFAULT clause, but we explicitly set it
-- for any NULL values that might exist

UPDATE public.courses
SET generation_mode = 'semi_automatic'
WHERE generation_mode IS NULL;

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
--
-- 1. Verify courses columns exist:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'courses'
--      AND column_name IN ('generation_mode', 'notify_on_completion',
--                          'notify_on_error', 'notify_on_stage_complete',
--                          'estimated_cost_usd');
--
-- 2. Verify users columns exist:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'users'
--      AND column_name IN ('telegram_chat_id', 'telegram_notifications_enabled');
--
-- 3. Verify indexes exist:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'courses' AND indexname LIKE '%generation_mode%';
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'users' AND indexname LIKE '%telegram%';
--
-- 4. Verify constraint exists:
--    SELECT conname FROM pg_constraint
--    WHERE conname = 'courses_generation_mode_check';
--
-- 5. Test inserting course with automatic mode:
--    INSERT INTO courses (title, slug, user_id, organization_id, generation_mode)
--    VALUES ('Test', 'test-auto', 'user-uuid', 'org-uuid', 'automatic');
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
