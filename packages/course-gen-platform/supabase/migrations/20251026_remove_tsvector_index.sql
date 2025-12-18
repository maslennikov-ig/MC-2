-- Migration: Remove tsvector index to support large documents
-- Date: 2025-10-26
-- Issue: PostgreSQL tsvector has 1MB limit, blocking large PDF/DOCX processing
-- Solution: Use Qdrant for all search (semantic via dense vectors, keyword via BM25 sparse vectors)

-- Drop the tsvector index that was causing 1MB limit
DROP INDEX IF EXISTS idx_file_catalog_markdown_content_search;

-- Update column comment to explain search strategy
COMMENT ON COLUMN file_catalog.markdown_content IS
'Converted Markdown text for hierarchical chunking. Preserves document structure (headings, tables, images, formulas).
NOTE: For search functionality:
  - Semantic search: Qdrant dense vectors (768D Jina-v3)
  - Keyword search: Qdrant sparse vectors (BM25)
  - No PostgreSQL tsvector index due to 1MB limit
Used by LangChain MarkdownHeaderTextSplitter for chunking, not for direct search queries.';

-- Verification
DO $$
BEGIN
  -- Verify index is dropped
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_markdown_content_search'
  ) THEN
    RAISE EXCEPTION 'Migration failed: tsvector index still exists';
  END IF;

  -- Verify column still exists (we only dropped the index, not the column)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog'
      AND column_name = 'markdown_content'
  ) THEN
    RAISE EXCEPTION 'Migration failed: markdown_content column missing';
  END IF;

  RAISE NOTICE 'Migration 20251026_remove_tsvector_index.sql completed successfully';
  RAISE NOTICE 'Large documents (>1MB) can now be processed without tsvector limit';
  RAISE NOTICE 'Search functionality provided by Qdrant (dense + sparse vectors)';
END;
$$;
