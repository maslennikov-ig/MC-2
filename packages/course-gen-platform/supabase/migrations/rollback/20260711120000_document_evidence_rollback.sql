-- Roll back durable advisory document evidence.

REVOKE EXECUTE ON FUNCTION public.persist_document_evidence_items(UUID, UUID, UUID, JSONB)
  FROM authenticated, service_role;
DROP FUNCTION IF EXISTS public.persist_document_evidence_items(UUID, UUID, UUID, JSONB);

DROP TABLE IF EXISTS public.document_evidence_decisions;
DROP TABLE IF EXISTS public.document_evidence_conflicts;
DROP TABLE IF EXISTS public.document_evidence_items;
DROP TABLE IF EXISTS public.document_evidence_runs;

DROP FUNCTION IF EXISTS public.reject_document_evidence_mutation();
DROP FUNCTION IF EXISTS public.validate_document_evidence_decision_chain();
DROP FUNCTION IF EXISTS public.validate_document_evidence_conflict_scope();
DROP FUNCTION IF EXISTS public.validate_document_evidence_item_scope();
DROP FUNCTION IF EXISTS public.validate_document_evidence_run_tenant();
DROP FUNCTION IF EXISTS public.enforce_document_evidence_run_source_set();
DROP FUNCTION IF EXISTS public.set_document_evidence_updated_at();

-- Restore the previous automatic-answer semantics.
CREATE OR REPLACE FUNCTION public.auto_answer_questions_atomic(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question RECORD;
  v_updated_count INTEGER := 0;
  v_fallback_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_first_answer TEXT;
  v_user_answer JSONB;
  v_answered_at TIMESTAMPTZ := now();
BEGIN
  SELECT count(*) INTO v_total_count
  FROM public.clarifying_questions
  WHERE course_id = p_course_id AND status = 'pending';

  FOR v_question IN
    SELECT id, suggested_answers, question_type
    FROM public.clarifying_questions
    WHERE course_id = p_course_id AND status = 'pending'
    FOR UPDATE
  LOOP
    v_first_answer := v_question.suggested_answers -> 0 ->> 'text';
    IF v_first_answer IS NULL OR v_first_answer = '' THEN
      v_first_answer := 'Auto-selected by system';
      v_fallback_count := v_fallback_count + 1;
    END IF;

    IF v_question.question_type = 'multi_choice' THEN
      v_user_answer := jsonb_build_object('values', jsonb_build_array(v_first_answer));
    ELSE
      v_user_answer := jsonb_build_object('value', v_first_answer);
    END IF;

    UPDATE public.clarifying_questions
    SET user_answer = v_user_answer,
        answer_source = 'suggested',
        selected_suggestion_index = 0,
        status = 'answered',
        answered_at = v_answered_at
    WHERE id = v_question.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'fallback_count', v_fallback_count,
    'total_pending', v_total_count,
    'answered_at', v_answered_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR',
      'updated_count', 0,
      'total_pending', v_total_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_answer_questions_atomic(UUID)
  TO authenticated, service_role;
