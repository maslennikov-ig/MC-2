-- Fix unique constraint to allow both lesson cards and course cards
-- Current: UNIQUE (lesson_id, enrichment_type) - blocks having both on same lesson
-- New: Separate partial indexes for lesson cards vs course cards

-- Drop existing constraint
ALTER TABLE lesson_enrichments 
DROP CONSTRAINT IF EXISTS lesson_enrichments_lesson_type_unique;

-- Create partial unique index for lesson cards (one per lesson per type, excluding course cards)
CREATE UNIQUE INDEX lesson_enrichments_lesson_type_unique 
ON lesson_enrichments (lesson_id, enrichment_type)
WHERE title IS DISTINCT FROM 'course-card';

-- Create partial unique index for course cards (one course-card per course)
CREATE UNIQUE INDEX lesson_enrichments_course_card_unique 
ON lesson_enrichments (course_id)
WHERE title = 'course-card';

-- Add comment explaining the design
COMMENT ON INDEX lesson_enrichments_lesson_type_unique IS 
  'Ensures one enrichment of each type per lesson (excluding course cards which use course_card_unique)';
COMMENT ON INDEX lesson_enrichments_course_card_unique IS 
  'Ensures one course-card per course (attached to first lesson but identified by title)';
