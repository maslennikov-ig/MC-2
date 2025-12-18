-- Fix courses with null slug
UPDATE courses 
SET slug = LOWER(
  SUBSTRING(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(title, '[^a-zA-Zа-яА-Я0-9\s-]', ''), 
        '\s+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    ),
    1, 100
  )
)
WHERE slug IS NULL AND title IS NOT NULL;

-- Fix duplicate slugs if any (add course ID suffix)
WITH duplicates AS (
  SELECT id, slug, 
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
  FROM courses
  WHERE slug IS NOT NULL
)
UPDATE courses 
SET slug = slug || '-' || SUBSTRING(id::text, 1, 8)
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Fix courses that have lessons but wrong status
UPDATE courses c
SET status = 'completed'
WHERE status IN ('generating_structure', 'generating') 
  AND EXISTS (
    SELECT 1 
    FROM sections s 
    JOIN lessons l ON l.section_id = s.id 
    WHERE s.course_id = c.id
    HAVING COUNT(l.id) > 0
  );

-- Update generation progress for completed courses
UPDATE courses
SET generation_progress = jsonb_set(
  jsonb_set(
    jsonb_set(
      generation_progress,
      '{steps}',
      (
        SELECT jsonb_agg(
          CASE 
            WHEN (step->>'id')::int <= 5 THEN 
              jsonb_set(step, '{status}', '"completed"'::jsonb)
            ELSE 
              step
          END
        )
        FROM jsonb_array_elements(generation_progress->'steps') AS step
      )
    ),
    '{percentage}',
    '100'::jsonb
  ),
  '{message}',
  '"Курс готов!"'::jsonb
)
WHERE status = 'completed' 
  AND generation_progress IS NOT NULL
  AND generation_progress->>'percentage' != '100';

-- Return updated courses
SELECT id, title, slug, status, 
       (SELECT COUNT(*) FROM sections WHERE course_id = courses.id) as sections,
       (SELECT COUNT(*) FROM lessons l JOIN sections s ON l.section_id = s.id WHERE s.course_id = courses.id) as lessons
FROM courses 
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;