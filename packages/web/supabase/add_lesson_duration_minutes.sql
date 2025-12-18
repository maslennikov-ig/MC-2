-- Migration: Add lesson_duration_minutes column to courses table
-- Date: 2025-10-06
-- Description: Replace unused 'prerequisites' field with 'lesson_duration_minutes' for controlling lesson length

-- Add lesson_duration_minutes column
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS lesson_duration_minutes INTEGER DEFAULT 5
CHECK (lesson_duration_minutes IN (3, 5, 10, 15, 20, 30, 45));

-- Add comment for documentation
COMMENT ON COLUMN public.courses.lesson_duration_minutes IS
'Длительность каждого урока в минутах (3, 5, 10, 15, 20, 30, 45).
Влияет на объем генерируемого контента:
- 3 мин: микрообучение (auto-set для microlearning style)
- 5 мин: стандарт (рекомендуется)
- 10-20 мин: углубленное изучение
- 30 мин: для сложных технических тем
- 45 мин: ЭКСТРЕМАЛЬНО, крайне не рекомендуется (низкий completion rate)';

-- Optional: Drop prerequisites column if not needed at course level
-- Uncomment if prerequisites should only exist at lesson/section level
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS prerequisites;

-- Update existing courses to have default 5 minutes
UPDATE public.courses
SET lesson_duration_minutes = 5
WHERE lesson_duration_minutes IS NULL;

-- Make column NOT NULL after setting defaults
ALTER TABLE public.courses
ALTER COLUMN lesson_duration_minutes SET NOT NULL;
