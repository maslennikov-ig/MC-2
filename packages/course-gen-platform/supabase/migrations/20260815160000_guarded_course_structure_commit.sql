-- Stage 5 could not save a structure for any course that carried document
-- evidence.
--
-- The commit guarded itself against a concurrent Stage 4 decision by asking
-- PostgREST to match the *entire* previous `analysis_result`, which puts the
-- whole document in the URL. A live run (mc2-2pplo, 2026-08-15) had 10,663
-- characters of it; the server answered `400 Bad Request`, which reached the
-- log as "Failed to save structure: Bad Request" and nothing else. Three
-- lessons had already been generated and paid for.
--
-- The guarantee is worth keeping, so the comparison moves into the database
-- where the snapshot travels in the request body and is compared as jsonb.
-- Returns the course id when it wrote, and NULL when the snapshot had moved.

CREATE OR REPLACE FUNCTION public.commit_course_structure_guarded(
  p_course_id UUID,
  p_expected_analysis_result JSONB,
  p_course_structure JSONB,
  p_generation_metadata JSONB,
  p_analysis_result JSONB,
  p_title TEXT DEFAULT NULL,
  p_course_description TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid
     ) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.courses SET
    course_structure = p_course_structure,
    generation_metadata = p_generation_metadata,
    analysis_result = p_analysis_result,
    -- A null argument leaves the column alone; Stage 5 only sends a title or a
    -- description when the model produced one.
    title = COALESCE(p_title, courses.title),
    course_description = COALESCE(p_course_description, courses.course_description),
    updated_at = now()
  WHERE courses.id = p_course_id
    AND courses.analysis_result IS NOT DISTINCT FROM p_expected_analysis_result
  RETURNING courses.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_course_structure_guarded(
  UUID, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_course_structure_guarded(
  UUID, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO service_role;
