-- Migration: 20251104162718_add_missing_performance_indexes.sql
-- Purpose: Add missing indexes on foreign key columns to improve JOIN performance
-- Priority: P0 (Immediate)
-- Estimated Impact: High (significantly improves JOIN queries involving these columns)
--
-- Background:
-- Supabase performance audit identified 2 foreign key columns without covering indexes,
-- causing slow JOIN queries when filtering by user or tracking generation history.
--
-- Affected Tables:
-- 1. generation_status_history.changed_by → auth.users(id)
-- 2. system_metrics.user_id → auth.users(id)
--
-- Performance Impact:
-- Without indexes, PostgreSQL must perform sequential scans on these tables when
-- joining with users table, causing O(n) lookups instead of O(log n).
--
-- Rollback Instructions:
-- DROP INDEX IF EXISTS idx_generation_history_changed_by;
-- DROP INDEX IF EXISTS idx_system_metrics_user_id;

-- ==============================================================================
-- Index 1: generation_status_history.changed_by
-- ==============================================================================
-- Use Case: Query generation history by the user who made the change
-- Example Query:
--   SELECT * FROM generation_status_history h
--   JOIN users u ON h.changed_by = u.id
--   WHERE u.email = 'user@example.com';
--
-- Performance: Reduces JOIN cost from O(n) sequential scan to O(log n) index lookup

CREATE INDEX IF NOT EXISTS idx_generation_history_changed_by
ON generation_status_history(changed_by)
WHERE changed_by IS NOT NULL;

COMMENT ON INDEX idx_generation_history_changed_by IS
  'Performance index for JOINs with users table. Partial index excludes NULL values (system-initiated changes).';

-- ==============================================================================
-- Index 2: system_metrics.user_id
-- ==============================================================================
-- Use Case: Query system metrics by user for monitoring and analytics
-- Example Query:
--   SELECT * FROM system_metrics m
--   JOIN users u ON m.user_id = u.id
--   WHERE u.organization_id = 'org-uuid';
--
-- Performance: Reduces JOIN cost from O(n) sequential scan to O(log n) index lookup

CREATE INDEX IF NOT EXISTS idx_system_metrics_user_id
ON system_metrics(user_id)
WHERE user_id IS NOT NULL;

COMMENT ON INDEX idx_system_metrics_user_id IS
  'Performance index for JOINs with users table. Partial index excludes NULL values (system-level metrics).';

-- ==============================================================================
-- Validation Queries (for testing)
-- ==============================================================================
-- These queries can be run to verify index usage:
--
-- 1. Check index exists:
--    SELECT schemaname, tablename, indexname
--    FROM pg_indexes
--    WHERE indexname IN ('idx_generation_history_changed_by', 'idx_system_metrics_user_id');
--
-- 2. Verify index is used in query plan:
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM generation_status_history WHERE changed_by = 'some-uuid';
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM system_metrics WHERE user_id = 'some-uuid';
--
-- 3. Check index size:
--    SELECT pg_size_pretty(pg_relation_size('idx_generation_history_changed_by'));
--    SELECT pg_size_pretty(pg_relation_size('idx_system_metrics_user_id'));

-- ==============================================================================
-- Migration Metadata
-- ==============================================================================
-- Author: Database Architect Agent
-- Date: 2025-11-04
-- Audit Report: docs/reports/database/2025-11/2025-11-04-supabase-audit-report.md
-- Performance Gain: ~10-100x faster JOINs on these foreign key relationships
