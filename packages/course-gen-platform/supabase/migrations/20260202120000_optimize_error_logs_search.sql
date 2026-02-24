-- Migration: 20260202120000_optimize_error_logs_search.sql
-- Purpose: Optimize ILIKE search performance for error_logs grouped view
-- Task: mc2-ahmo
--
-- Problem: get_grouped_error_logs RPC uses ILIKE '%search%' which cannot use
-- existing GIN index (to_tsvector). ILIKE with leading wildcard requires pg_trgm.
--
-- Solution: Install pg_trgm extension and create GIN trigram index.
-- Expected improvement: ILIKE search from 625ms → <200ms

-- ============================================================================
-- 1. Enable pg_trgm extension for trigram-based text search
-- ============================================================================
-- pg_trgm provides functions and operators for determining string similarity
-- based on trigram matching. It also provides index operator classes that
-- support fast searching for similar strings.
--
-- Reference: https://www.postgresql.org/docs/current/pgtrgm.html

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. Create GIN trigram index for ILIKE searches
-- ============================================================================
-- This index accelerates queries like: WHERE error_message ILIKE '%pattern%'
-- Without this index, ILIKE with leading wildcard does sequential scan.
--
-- Note: Using regular CREATE INDEX (not CONCURRENTLY) because:
-- - pg_trgm extension must be committed before index can use gin_trgm_ops
-- - CREATE INDEX CONCURRENTLY cannot run inside transaction block
-- - Migration runs as single transaction
--
-- For production with high traffic, consider applying this during low-traffic window.

CREATE INDEX IF NOT EXISTS idx_error_logs_error_message_trgm
ON error_logs USING gin (error_message gin_trgm_ops);

COMMENT ON INDEX idx_error_logs_error_message_trgm IS
'GIN trigram index for fast ILIKE searches on error_message. Used by get_grouped_error_logs RPC. Task: mc2-ahmo';

-- ============================================================================
-- 3. Verify extension and index were created
-- ============================================================================
DO $$
BEGIN
  -- Check extension
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION 'Failed to create pg_trgm extension';
  END IF;

  -- Check index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_error_logs_error_message_trgm'
  ) THEN
    RAISE EXCEPTION 'Failed to create idx_error_logs_error_message_trgm';
  END IF;

  RAISE NOTICE 'Successfully created pg_trgm extension and trigram index';
END;
$$;
