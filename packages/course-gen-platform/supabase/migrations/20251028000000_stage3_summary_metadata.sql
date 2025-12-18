-- Stage 3: Document Summarization Metadata
-- Migration: 20251028000000_stage3_summary_metadata
-- Purpose: Add summary columns to file_catalog table

-- Add processed_content column (LLM summary or full text)
ALTER TABLE file_catalog
ADD COLUMN processed_content TEXT NULL;

COMMENT ON COLUMN file_catalog.processed_content IS
'LLM-generated summary (hierarchical) or full text (if <3K tokens)';

-- Add processing_method column (strategy used)
ALTER TABLE file_catalog
ADD COLUMN processing_method VARCHAR(50) NULL
CONSTRAINT check_processing_method CHECK (processing_method IN ('full_text', 'hierarchical'));

COMMENT ON COLUMN file_catalog.processing_method IS
'Processing strategy: full_text (<3K tokens) or hierarchical (>3K tokens). Future: chain_of_density';

-- Add summary_metadata column (JSONB for token counts, costs, quality)
ALTER TABLE file_catalog
ADD COLUMN summary_metadata JSONB NULL;

COMMENT ON COLUMN file_catalog.summary_metadata IS
'Metadata: token counts, cost, quality score, model used, timestamps';

-- Create index for analytics queries
CREATE INDEX idx_file_catalog_processing_method
ON file_catalog(processing_method);

-- Rollback instructions (manual):
-- DROP INDEX IF EXISTS idx_file_catalog_processing_method;
-- ALTER TABLE file_catalog DROP CONSTRAINT IF EXISTS check_processing_method;
-- ALTER TABLE file_catalog DROP COLUMN IF EXISTS summary_metadata;
-- ALTER TABLE file_catalog DROP COLUMN IF EXISTS processing_method;
-- ALTER TABLE file_catalog DROP COLUMN IF EXISTS processed_content;
