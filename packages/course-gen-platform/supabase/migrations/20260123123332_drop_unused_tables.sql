-- Migration: Drop unused tables
-- Date: 2026-01-23
-- Reason: These tables were created but never used in the codebase
-- Backup saved to: .tmp/db-backups/2026-01-23/unused-tables-backup.sql

-- ============================================
-- DROP TABLE: generation_locks
-- Was intended for: Distributed locking during generation
-- Usage in code: 0 references
-- Data: Empty (0 rows)
-- ============================================
DROP TABLE IF EXISTS generation_locks CASCADE;

-- ============================================
-- DROP TABLE: generation_stats
-- Was intended for: Aggregated generation statistics per course
-- Usage in code: Only in database.types.ts (auto-generated)
-- Data: Empty (0 rows)
-- ============================================
DROP TABLE IF EXISTS generation_stats CASCADE;

-- ============================================
-- DROP TABLE: generation_trace_archive
-- Was intended for: Archiving old generation_trace records
-- Usage in code: Only in database.types.ts (auto-generated)
-- Data: Empty (0 rows)
-- ============================================
DROP TABLE IF EXISTS generation_trace_archive CASCADE;

-- ============================================
-- DROP TABLE: lesson_improvement_suggestions
-- Was intended for: Storing lesson improvement suggestions from Judge
-- Usage in code: 0 references
-- Data: Empty (0 rows)
-- ============================================
DROP TABLE IF EXISTS lesson_improvement_suggestions CASCADE;

-- Note: CASCADE will automatically drop:
-- - All RLS policies (13 policies)
-- - All indexes (18 indexes)
-- - All foreign key constraints
