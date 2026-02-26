-- Migration: Add GIN index for JSONB user_answer column
-- Issue: MEDIUM-001 (mc2-tctv)
-- Purpose: Improve query performance for JSONB containment and key existence queries
--
-- GIN (Generalized Inverted Index) is optimal for JSONB columns when:
-- - Querying for key existence (@?)
-- - Containment queries (@>)
-- - Full-text search within JSONB
--
-- This index supports queries like:
-- - WHERE user_answer @> '{"value": "some text"}'
-- - WHERE user_answer ? 'value'
-- - WHERE user_answer ?| array['value', 'values']

-- ============================================================================
-- STEP 1: Create GIN index on user_answer JSONB column
-- ============================================================================

-- Use CONCURRENTLY to avoid blocking reads/writes during index creation
-- Note: This may fail if run inside a transaction block. If so, run manually.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clarifying_questions_user_answer_gin
ON clarifying_questions USING GIN (user_answer);

-- ============================================================================
-- STEP 2: Documentation
-- ============================================================================

COMMENT ON INDEX idx_clarifying_questions_user_answer_gin IS
'GIN index for JSONB user_answer column.
Supports containment queries (@>), key existence (?), and any/all key existence (?|, ?&).
Created for issue MEDIUM-001 to improve query performance on structured answers.

Example queries that benefit from this index:
- SELECT * FROM clarifying_questions WHERE user_answer @> ''{"value": "specific answer"}'';
- SELECT * FROM clarifying_questions WHERE user_answer ? ''values'';
- SELECT * FROM clarifying_questions WHERE user_answer ?| array[''value'', ''values''];';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'clarifying_questions'
    AND indexname = 'idx_clarifying_questions_user_answer_gin'
  ) INTO index_exists;

  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'idx_clarifying_questions_user_answer_gin exists: %', index_exists;
  RAISE NOTICE '==============================';
END $$;
