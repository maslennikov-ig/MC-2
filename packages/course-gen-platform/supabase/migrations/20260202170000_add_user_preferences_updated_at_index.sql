-- ============================================================================
-- Migration: 20260202170000_add_user_preferences_updated_at_index.sql
-- Purpose: Add index on updated_at for time-based queries
-- Date: 2026-02-02
-- Issue: mc2-np3d
-- ============================================================================
--
-- Description:
-- Adds index on updated_at column for potential time-based queries
-- (e.g., "sync all preferences modified in last 24h").
-- Uses DESC order for efficient "recent first" queries.
--
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at
    ON public.user_preferences(updated_at DESC);

COMMENT ON INDEX public.idx_user_preferences_updated_at IS
    'Index for time-based queries on user_preferences (e.g., recent modifications)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--
-- Verify index exists:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'user_preferences';
--
-- ============================================================================
