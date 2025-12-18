-- Migration: Fix sections and lessons data structure for practical_exercises
-- Date: 2025-01-13
-- Purpose: Change activities to JSONB and add learning_objectives array to sections

-- ============================================================================
-- STEP 1: Add learning_objectives array to sections (keep old objective field)
-- ============================================================================

-- Add new column for array of learning objectives
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS learning_objectives text[];

-- Migrate data from objective (text) to learning_objectives (array)
-- If objective is already JSON array string, parse it; otherwise wrap in array
UPDATE sections
SET learning_objectives = CASE
    WHEN objective IS NULL THEN ARRAY[]::text[]
    WHEN objective::text LIKE '[%]' THEN
        -- Try to parse as JSON array
        (SELECT ARRAY(SELECT jsonb_array_elements_text(objective::jsonb)))
    ELSE
        -- Wrap single value in array
        ARRAY[objective]
END
WHERE learning_objectives IS NULL;

-- Optional: Drop old objective column after migration (commented out for safety)
-- ALTER TABLE sections DROP COLUMN objective;

COMMENT ON COLUMN sections.learning_objectives IS 'Array of learning objectives for this section (migrated from objective field)';

-- ============================================================================
-- STEP 2: Change lessons.activities from text[] to JSONB
-- ============================================================================

-- Rename old activities column
ALTER TABLE lessons
RENAME COLUMN activities TO activities_old;

-- Add new activities column as JSONB
ALTER TABLE lessons
ADD COLUMN activities jsonb DEFAULT '[]'::jsonb;

-- Migrate data: convert text[] to jsonb array
-- If activities_old has JSON strings, parse them; otherwise create simple array
UPDATE lessons
SET activities = CASE
    WHEN activities_old IS NULL OR array_length(activities_old, 1) IS NULL THEN '[]'::jsonb
    WHEN activities_old[1]::text LIKE '{%' THEN
        -- Already JSON objects, convert array to jsonb
        (SELECT jsonb_agg(item::jsonb) FROM unnest(activities_old) AS item)
    ELSE
        -- Simple strings, wrap in objects with exercise_title
        (SELECT jsonb_agg(jsonb_build_object('exercise_title', item, 'exercise_type', 'hands_on', 'exercise_description', item))
         FROM unnest(activities_old) AS item)
END;

-- Optional: Drop old activities_old column after verification (commented out for safety)
-- ALTER TABLE lessons DROP COLUMN activities_old;

COMMENT ON COLUMN lessons.activities IS 'Array of practical exercises as JSONB objects with exercise_type, exercise_title, exercise_description';

-- ============================================================================
-- STEP 3: Verify migration
-- ============================================================================

-- Check sections migration
DO $$
DECLARE
    sections_with_objectives integer;
    sections_migrated integer;
BEGIN
    SELECT COUNT(*) INTO sections_with_objectives FROM sections WHERE objective IS NOT NULL;
    SELECT COUNT(*) INTO sections_migrated FROM sections WHERE learning_objectives IS NOT NULL AND array_length(learning_objectives, 1) > 0;

    RAISE NOTICE 'Sections with objectives: %, Migrated: %', sections_with_objectives, sections_migrated;
END $$;

-- Check lessons migration
DO $$
DECLARE
    lessons_with_activities integer;
    lessons_migrated integer;
BEGIN
    SELECT COUNT(*) INTO lessons_with_activities FROM lessons WHERE activities_old IS NOT NULL AND array_length(activities_old, 1) > 0;
    SELECT COUNT(*) INTO lessons_migrated FROM lessons WHERE activities IS NOT NULL AND jsonb_array_length(activities) > 0;

    RAISE NOTICE 'Lessons with activities: %, Migrated: %', lessons_with_activities, lessons_migrated;
END $$;

-- ============================================================================
-- ROLLBACK (if needed - run these commands manually)
-- ============================================================================

/*
-- Rollback sections
ALTER TABLE sections DROP COLUMN IF EXISTS learning_objectives;

-- Rollback lessons
ALTER TABLE lessons DROP COLUMN IF EXISTS activities;
ALTER TABLE lessons RENAME COLUMN activities_old TO activities;
*/
