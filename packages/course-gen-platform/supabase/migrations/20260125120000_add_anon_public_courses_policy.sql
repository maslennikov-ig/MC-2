-- Migration: add_anon_public_courses_policy
-- Purpose: Allow anonymous users to view public courses
-- This enables public course sharing without authentication

-- =============================================================================
-- 1. Add SELECT policy for anonymous users to view public courses
-- =============================================================================

-- Policy for anonymous users to SELECT public courses
CREATE POLICY "courses_public_read" ON public.courses
FOR SELECT
TO anon
USING (visibility = 'public');

COMMENT ON POLICY "courses_public_read" ON public.courses IS
  'Allow anonymous users to view public courses. Enables course sharing and discovery without login.';

-- =============================================================================
-- 2. Also add policy for sections of public courses
-- =============================================================================
CREATE POLICY "sections_public_read" ON public.sections
FOR SELECT
TO anon
USING (
  course_id IN (
    SELECT id FROM public.courses WHERE visibility = 'public'
  )
);

COMMENT ON POLICY "sections_public_read" ON public.sections IS
  'Allow anonymous users to view sections of public courses.';

-- =============================================================================
-- 3. Also add policy for lessons of public courses
-- =============================================================================
CREATE POLICY "lessons_public_read" ON public.lessons
FOR SELECT
TO anon
USING (
  section_id IN (
    SELECT s.id FROM public.sections s
    JOIN public.courses c ON s.course_id = c.id
    WHERE c.visibility = 'public'
  )
);

COMMENT ON POLICY "lessons_public_read" ON public.lessons IS
  'Allow anonymous users to view lessons of public courses.';

-- =============================================================================
-- 4. Also add policy for lesson_contents of public courses
-- =============================================================================
CREATE POLICY "lesson_contents_public_read" ON public.lesson_contents
FOR SELECT
TO anon
USING (
  lesson_id IN (
    SELECT l.id FROM public.lessons l
    JOIN public.sections s ON l.section_id = s.id
    JOIN public.courses c ON s.course_id = c.id
    WHERE c.visibility = 'public'
  )
);

COMMENT ON POLICY "lesson_contents_public_read" ON public.lesson_contents IS
  'Allow anonymous users to view lesson contents of public courses.';

-- =============================================================================
-- 5. Also add policy for assets of public courses
-- =============================================================================
CREATE POLICY "assets_public_read" ON public.assets
FOR SELECT
TO anon
USING (
  lesson_id IN (
    SELECT l.id FROM public.lessons l
    JOIN public.sections s ON l.section_id = s.id
    JOIN public.courses c ON s.course_id = c.id
    WHERE c.visibility = 'public'
  )
);

COMMENT ON POLICY "assets_public_read" ON public.assets IS
  'Allow anonymous users to view assets of public courses.';

-- =============================================================================
-- 6. Also add policy for lesson_enrichments of public courses
-- =============================================================================
CREATE POLICY "lesson_enrichments_public_read" ON public.lesson_enrichments
FOR SELECT
TO anon
USING (
  lesson_id IN (
    SELECT l.id FROM public.lessons l
    JOIN public.sections s ON l.section_id = s.id
    JOIN public.courses c ON s.course_id = c.id
    WHERE c.visibility = 'public'
  )
);

COMMENT ON POLICY "lesson_enrichments_public_read" ON public.lesson_enrichments IS
  'Allow anonymous users to view lesson enrichments of public courses.';
