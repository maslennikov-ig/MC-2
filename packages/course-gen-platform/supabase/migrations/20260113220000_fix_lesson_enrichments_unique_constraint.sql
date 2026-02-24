-- Migration: Fix unique constraint to allow both lesson cards and course cards
-- Description: The current UNIQUE (lesson_id, enrichment_type) constraint prevents having
--              both a lesson card AND a course card attached to the same lesson (first lesson).
--              We need partial unique indexes to allow this case.
--
-- Changes:
-- 1. Drop existing unique constraint on (lesson_id, enrichment_type)
-- 2. Create partial unique index for lesson cards (when title != 'course-card')
-- 3. Create partial unique index for course cards (one per course)

-- ============================================================================
-- 1. Drop existing unique constraint
-- ============================================================================

ALTER TABLE lesson_enrichments
DROP CONSTRAINT IF EXISTS lesson_enrichments_lesson_id_enrichment_type_key;

-- ============================================================================
-- 2. Create partial unique index for lesson cards
-- ============================================================================
-- Each lesson can have at most one card/cover per type (excluding course-card)

CREATE UNIQUE INDEX IF NOT EXISTS lesson_enrichments_lesson_card_unique
ON lesson_enrichments (lesson_id, enrichment_type)
WHERE title IS DISTINCT FROM 'course-card';

-- ============================================================================
-- 3. Create partial unique index for course cards
-- ============================================================================
-- Each course can have at most one course card

CREATE UNIQUE INDEX IF NOT EXISTS lesson_enrichments_course_card_unique
ON lesson_enrichments (course_id, enrichment_type)
WHERE title = 'course-card';

-- ============================================================================
-- 4. Add comment for documentation
-- ============================================================================

COMMENT ON INDEX lesson_enrichments_lesson_card_unique IS
'Ensures each lesson has at most one card/cover per enrichment type (excluding course-level cards)';

COMMENT ON INDEX lesson_enrichments_course_card_unique IS
'Ensures each course has at most one course-level card (title=course-card)';
