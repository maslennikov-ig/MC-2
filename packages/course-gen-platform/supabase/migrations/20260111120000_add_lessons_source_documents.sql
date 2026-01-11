-- Migration: Add source_documents column to lessons table
-- Purpose: Store which documents contributed to lesson content generation
-- See: docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md

-- Add source_documents column to lessons table
-- Format: Array of {document_id, document_name, document_priority, chunk_count}
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS source_documents jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN lessons.source_documents IS
'Array of source documents that contributed to lesson generation. Format: [{document_id: uuid, document_name: string, document_priority: CORE|IMPORTANT|SUPPLEMENTARY, chunk_count: number}]. Populated during Stage 6 RAG retrieval.';

-- Create index for querying lessons by source document
-- Useful for: "which lessons used document X?"
CREATE INDEX IF NOT EXISTS idx_lessons_source_documents
ON lessons USING gin (source_documents jsonb_path_ops);

-- Add RLS policy to allow reading source_documents
-- (inherits existing lessons policies, no additional policy needed)

-- ============================================================================
-- TESTING GUIDANCE
-- ============================================================================
-- After applying this migration, verify with the following SQL commands:
--
-- 1. Check column exists:
--    SELECT column_name, data_type, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'lessons' AND column_name = 'source_documents';
--    -- Expected: column_name='source_documents', data_type='jsonb', column_default='[]::jsonb'
--
-- 2. Check GIN index exists:
--    SELECT indexname, indexdef
--    FROM pg_indexes
--    WHERE indexname = 'idx_lessons_source_documents';
--    -- Expected: Returns 1 row with the index definition
--
-- 3. Test insert with sample data:
--    UPDATE lessons
--    SET source_documents = '[{"document_id": "00000000-0000-0000-0000-000000000001", "document_name": "test.pdf", "document_priority": "CORE", "chunk_count": 5}]'::jsonb
--    WHERE id = (SELECT id FROM lessons LIMIT 1);
--    -- Expected: 1 row updated
--
-- 4. Test GIN index query (find lessons using a specific document):
--    SELECT id, title
--    FROM lessons
--    WHERE source_documents @> '[{"document_id": "00000000-0000-0000-0000-000000000001"}]';
--    -- Expected: Returns lesson(s) containing that document_id
--
-- 5. Verify RLS still works (as authenticated user):
--    -- Existing RLS policies on lessons table automatically apply to new column
--    -- No additional policy configuration needed
-- ============================================================================
