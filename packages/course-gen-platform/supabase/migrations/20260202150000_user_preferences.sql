-- ============================================================================
-- Migration: 20260202150000_user_preferences.sql
-- Purpose: Create user_preferences table for storing user-specific settings
-- Date: 2026-02-02
-- ============================================================================
--
-- Description:
-- Creates a user_preferences table to store user-specific settings as JSONB.
-- Each user can have exactly one preferences record (enforced by UNIQUE constraint).
-- Row-Level Security ensures users can only access their own preferences.
--
-- Changes:
-- 1. Create user_preferences table with JSONB preferences column
-- 2. Add index on user_id for efficient lookups
-- 3. Enable RLS and create policies for authenticated users
-- 4. Add trigger for automatic updated_at timestamp
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Create user_preferences table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE public.user_preferences IS
    'Stores user-specific preferences and settings as JSONB. One record per user.';

-- Add column comments
COMMENT ON COLUMN public.user_preferences.id IS
    'Unique identifier for the preferences record';

COMMENT ON COLUMN public.user_preferences.user_id IS
    'Reference to auth.users. Each user can have exactly one preferences record.';

COMMENT ON COLUMN public.user_preferences.preferences IS
    'JSONB object containing user preferences. Schema is flexible and can store any user settings.';

COMMENT ON COLUMN public.user_preferences.created_at IS
    'Timestamp when the preferences record was created';

COMMENT ON COLUMN public.user_preferences.updated_at IS
    'Timestamp when the preferences were last modified. Auto-updated by trigger.';

-- ============================================================================
-- STEP 2: Add index on user_id for efficient lookups
-- ============================================================================
-- Although user_id has a UNIQUE constraint (which creates an index),
-- we explicitly create the index for clarity and documentation

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
    ON public.user_preferences(user_id);

-- ============================================================================
-- STEP 3: Enable Row-Level Security and create policies
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own preferences
CREATE POLICY users_select_own_preferences
    ON public.user_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Users can INSERT their own preferences
CREATE POLICY users_insert_own_preferences
    ON public.user_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own preferences
CREATE POLICY users_update_own_preferences
    ON public.user_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own preferences
CREATE POLICY users_delete_own_preferences
    ON public.user_preferences
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Add policy comments
COMMENT ON POLICY users_select_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only read their own preferences';

COMMENT ON POLICY users_insert_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only insert preferences for themselves';

COMMENT ON POLICY users_update_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only update their own preferences';

COMMENT ON POLICY users_delete_own_preferences ON public.user_preferences IS
    'RLS policy: Authenticated users can only delete their own preferences';

-- ============================================================================
-- STEP 4: Add trigger for automatic updated_at timestamp
-- ============================================================================
-- Uses the existing update_updated_at_column() function

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TRIGGER update_user_preferences_updated_at ON public.user_preferences IS
    'Automatically updates the updated_at column on every UPDATE operation';

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
--
-- After applying this migration:
--
-- 1. Verify table exists:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name = 'user_preferences';
--
-- 2. Verify columns:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'user_preferences';
--
-- 3. Verify index exists:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'user_preferences';
--
-- 4. Verify RLS is enabled:
--    SELECT relname, relrowsecurity
--    FROM pg_class
--    WHERE relname = 'user_preferences';
--
-- 5. Verify policies exist:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE tablename = 'user_preferences';
--
-- 6. Test CRUD operations as authenticated user:
--    -- INSERT (should succeed for own user_id)
--    INSERT INTO user_preferences (user_id, preferences)
--    VALUES (auth.uid(), '{"theme": "dark"}');
--
--    -- SELECT (should return only own record)
--    SELECT * FROM user_preferences;
--
--    -- UPDATE (should succeed for own record)
--    UPDATE user_preferences
--    SET preferences = '{"theme": "light"}'
--    WHERE user_id = auth.uid();
--
--    -- DELETE (should succeed for own record)
--    DELETE FROM user_preferences WHERE user_id = auth.uid();
--
-- 7. Test that updated_at trigger works:
--    INSERT INTO user_preferences (user_id, preferences) VALUES (auth.uid(), '{}');
--    SELECT created_at, updated_at FROM user_preferences WHERE user_id = auth.uid();
--    -- Wait a moment then update
--    UPDATE user_preferences SET preferences = '{"test": true}' WHERE user_id = auth.uid();
--    SELECT created_at, updated_at FROM user_preferences WHERE user_id = auth.uid();
--    -- updated_at should be different from created_at
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
