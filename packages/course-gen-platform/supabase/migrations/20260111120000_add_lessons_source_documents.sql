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
