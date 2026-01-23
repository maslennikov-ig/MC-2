-- Migrate enrichment image URLs from Supabase Storage to local storage
--
-- This migration updates all imageUrl fields in lesson_enrichments.content
-- from Supabase Storage URLs to local storage URLs served by nginx.
--
-- Before running this migration:
-- 1. Run scripts/migrate-enrichments.sh to download files to /opt/megacampus/data/enrichments
-- 2. Verify nginx config has /storage/enrichments/ location
-- 3. Verify docker-compose has enrichments volume mounted
--
-- Old format: https://diqooqbuchsliypgwksu.supabase.co/storage/v1/object/public/course-enrichments/{path}
-- New format: https://ai.megacampus.ru/storage/enrichments/{path}
--
-- @see scripts/migrate-enrichments.sh
-- @see nginx-megacampus.conf

-- Update imageUrl in lesson_enrichments content JSONB
UPDATE lesson_enrichments
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      'https://diqooqbuchsliypgwksu\.supabase\.co/storage/v1/object/public/course-enrichments/',
      'https://ai.megacampus.ru/storage/enrichments/'
    )
  )
)
WHERE content->>'imageUrl' LIKE '%supabase.co%course-enrichments%';

-- Verify the update (for logging)
DO $$
DECLARE
  updated_count INTEGER;
  remaining_supabase INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM lesson_enrichments
  WHERE content->>'imageUrl' LIKE '%ai.megacampus.ru/storage/enrichments%';

  SELECT COUNT(*) INTO remaining_supabase
  FROM lesson_enrichments
  WHERE content->>'imageUrl' LIKE '%supabase%';

  RAISE NOTICE 'Enrichment URLs migrated: % records now use local storage', updated_count;

  IF remaining_supabase > 0 THEN
    RAISE WARNING 'Found % records still using Supabase URLs - check migration', remaining_supabase;
  ELSE
    RAISE NOTICE 'All enrichment URLs successfully migrated to local storage';
  END IF;
END $$;

-- Comment for tracking
COMMENT ON TABLE lesson_enrichments IS 'Lesson enrichments (cover images, cards, quizzes, audio). Images migrated from Supabase Storage to local storage on 2026-01-23';
