-- Add 'cover' value to enrichment_type enum for lesson cover image generation
ALTER TYPE enrichment_type ADD VALUE IF NOT EXISTS 'cover';
