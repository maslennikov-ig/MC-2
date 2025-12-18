-- Migration: 20251202143000_add_priority_constraints.sql
-- Purpose: Add database constraints for document prioritization
--
-- This migration enforces business rules for document priority:
-- 1. Only ONE document can be marked as CORE per course
-- 2. Optimizes queries filtering by course_id and priority
--
-- Constraints:
-- - idx_one_core_per_course: Unique partial index ensuring only 1 CORE document per course
-- - idx_file_catalog_priority: Composite index for performance on priority queries
--
-- Migration is idempotent (safe to run multiple times)

-- ==============================================================================
-- UNIQUE CONSTRAINT: Only 1 CORE document per course
-- ==============================================================================
-- This partial index creates a unique constraint that only applies when priority = 'CORE'
-- It prevents multiple documents from being marked as CORE for the same course
-- while allowing unlimited SUPPLEMENTARY documents.
--
-- Example scenarios:
-- ✓ ALLOWED: course_123 has 1 CORE + 5 SUPPLEMENTARY documents
-- ✗ BLOCKED: course_123 tries to add a 2nd CORE document (unique constraint violation)

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_core_per_course
ON file_catalog (course_id)
WHERE priority = 'CORE';

COMMENT ON INDEX idx_one_core_per_course IS
'Ensures only one CORE document per course. Partial index only applies when priority = CORE.';

-- ==============================================================================
-- PERFORMANCE INDEX: Optimize priority queries
-- ==============================================================================
-- Composite index on (course_id, priority) to speed up common queries:
-- - SELECT * FROM file_catalog WHERE course_id = X AND priority = 'CORE'
-- - SELECT * FROM file_catalog WHERE course_id = X ORDER BY priority
--
-- This index will be used by:
-- - Document prioritization UI queries
-- - RAG context retrieval (fetching CORE documents first)
-- - Document classification workflows

CREATE INDEX IF NOT EXISTS idx_file_catalog_priority
ON file_catalog (course_id, priority);

COMMENT ON INDEX idx_file_catalog_priority IS
'Composite index for fast lookups by course and priority level. Optimizes document prioritization queries.';
