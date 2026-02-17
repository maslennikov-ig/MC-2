-- Migration: Replace all Gemini model references with google/gemini-3-flash-preview
-- Date: 2026-02-17
-- Keeping google/gemini-2.5-flash-image for image generation unchanged

-- Update primary model references (exclude image model)
-- Replace old Gemini models with new Gemini 3 Flash Preview
UPDATE llm_model_config
SET model_id = 'google/gemini-3-flash-preview'
WHERE model_id IN (
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-preview',
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-thinking-exp-01-21'
)
AND model_id != 'google/gemini-2.5-flash-image';

-- Update fallback model references
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-3-flash-preview'
WHERE fallback_model_id IN (
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-preview',
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-thinking-exp-01-21'
)
AND fallback_model_id != 'google/gemini-2.5-flash-image';

-- Verify no accidental replacements of image model
-- This should return 0 rows (safety check)
DO $$
DECLARE
  image_model_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO image_model_count
  FROM llm_model_config
  WHERE model_id = 'google/gemini-2.5-flash-image'
     OR fallback_model_id = 'google/gemini-2.5-flash-image';

  IF image_model_count = 0 THEN
    RAISE WARNING 'WARNING: Image model google/gemini-2.5-flash-image was accidentally removed. Please restore it.';
  END IF;
END $$;
