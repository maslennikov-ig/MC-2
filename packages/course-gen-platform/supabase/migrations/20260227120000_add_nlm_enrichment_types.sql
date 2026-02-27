-- Add 4 new NotebookLM enrichment types to the enrichment_type enum
-- These support: Study Guide, Flashcards, Mind Map, Infographic

ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_study_guide';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_flashcards';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_mind_map';
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'nlm_infographic';
