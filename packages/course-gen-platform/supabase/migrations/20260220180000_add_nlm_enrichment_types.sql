-- Add 'nlm_audio' and 'nlm_video' values to enrichment_type enum
-- for NotebookLM-generated audio/video enrichment support
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_audio';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_video';
