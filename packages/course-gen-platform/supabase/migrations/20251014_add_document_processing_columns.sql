-- Migration: Add document processing columns for markdown conversion and metadata
-- Date: 2025-10-14
-- Task: T074.3 - Implement Markdown conversion pipeline
-- Description: Adds parsed_content (JSONB) and markdown_content (TEXT) columns to file_catalog
--              for storing DoclingDocument JSON and converted Markdown text.

-- Add parsed_content column for storing full DoclingDocument JSON
-- This provides comprehensive metadata including images, tables, fonts, coordinates
ALTER TABLE file_catalog
ADD COLUMN IF NOT EXISTS parsed_content JSONB;

-- Add markdown_content column for storing converted Markdown text
-- This is the clean, structured text format used for hierarchical chunking
ALTER TABLE file_catalog
ADD COLUMN IF NOT EXISTS markdown_content TEXT;

-- Add index on parsed_content for JSON queries (e.g., extracting image count)
CREATE INDEX IF NOT EXISTS idx_file_catalog_parsed_content_metadata
ON file_catalog USING GIN ((parsed_content -> 'metadata'));

-- Add index on markdown_content for full-text search
CREATE INDEX IF NOT EXISTS idx_file_catalog_markdown_content_search
ON file_catalog USING GIN (to_tsvector('english', markdown_content));

-- Update file_catalog trigger to include new columns in updated_at
-- (Assumes there's already a trigger for updated_at - this ensures it includes new columns)

-- Add comment for parsed_content column
COMMENT ON COLUMN file_catalog.parsed_content IS
'Full DoclingDocument JSON with comprehensive metadata: texts[], pictures[], tables[], pages[], metadata. Used for enriching chunks with page numbers, coordinates, images, and structure information.';

-- Add comment for markdown_content column
COMMENT ON COLUMN file_catalog.markdown_content IS
'Converted Markdown text for hierarchical chunking. Preserves document structure (headings, tables, images, formulas) in a unified format suitable for LangChain MarkdownHeaderTextSplitter.';

-- Create a view for documents with processing status
CREATE OR REPLACE VIEW file_catalog_processing_status AS
SELECT
  id,
  filename,
  file_type,
  vector_status,
  created_at,
  updated_at,
  CASE
    WHEN parsed_content IS NULL THEN 'not_processed'
    WHEN markdown_content IS NULL THEN 'json_only'
    ELSE 'fully_processed'
  END AS processing_status,
  CASE
    WHEN parsed_content IS NOT NULL THEN (parsed_content -> 'metadata' ->> 'page_count')::INTEGER
    ELSE NULL
  END AS page_count,
  CASE
    WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'texts')
    ELSE NULL
  END AS text_elements,
  CASE
    WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'pictures')
    ELSE NULL
  END AS image_count,
  CASE
    WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'tables')
    ELSE NULL
  END AS table_count,
  CASE
    WHEN markdown_content IS NOT NULL THEN length(markdown_content)
    ELSE NULL
  END AS markdown_length
FROM file_catalog;

-- Add comment for the view
COMMENT ON VIEW file_catalog_processing_status IS
'Provides processing status overview for file_catalog entries, including document statistics extracted from parsed_content JSONB.';

-- Grant appropriate permissions
GRANT SELECT ON file_catalog_processing_status TO authenticated;

-- Create function to update processing metadata
CREATE OR REPLACE FUNCTION update_file_catalog_processing(
  p_file_id UUID,
  p_parsed_content JSONB,
  p_markdown_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE file_catalog
  SET
    parsed_content = p_parsed_content,
    markdown_content = p_markdown_content,
    updated_at = NOW()
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found: %', p_file_id;
  END IF;
END;
$$;

-- Add comment for the function
COMMENT ON FUNCTION update_file_catalog_processing IS
'Updates file_catalog with processed document content (DoclingDocument JSON and Markdown). Used by document processing pipeline.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_file_catalog_processing TO authenticated;

-- Migration validation
DO $$
BEGIN
  -- Verify columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog'
      AND column_name = 'parsed_content'
  ) THEN
    RAISE EXCEPTION 'Migration failed: parsed_content column not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog'
      AND column_name = 'markdown_content'
  ) THEN
    RAISE EXCEPTION 'Migration failed: markdown_content column not created';
  END IF;

  -- Verify indexes exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_parsed_content_metadata'
  ) THEN
    RAISE EXCEPTION 'Migration failed: parsed_content index not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_markdown_content_search'
  ) THEN
    RAISE EXCEPTION 'Migration failed: markdown_content index not created';
  END IF;

  -- Verify view exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog_processing_status'
  ) THEN
    RAISE EXCEPTION 'Migration failed: file_catalog_processing_status view not created';
  END IF;

  -- Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_file_catalog_processing'
  ) THEN
    RAISE EXCEPTION 'Migration failed: update_file_catalog_processing function not created';
  END IF;

  RAISE NOTICE 'Migration 20251014_add_document_processing_columns.sql completed successfully';
END;
$$;
