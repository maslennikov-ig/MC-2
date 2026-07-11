-- Refuse to erase durable side-aware audit decisions.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_evidence_decisions
    WHERE selected_side_handle IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back durable conflict side identity with side-aware decisions';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_document_evidence_question_atomic(
  p_course_id UUID,
  p_run_id UUID,
  p_organization_id UUID,
  p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_question public.clarifying_questions%ROWTYPE;
  v_existing public.document_evidence_decisions%ROWTYPE;
  v_decision public.document_evidence_decisions%ROWTYPE;
  v_recommended_count INTEGER;
  v_recommended_index INTEGER;
  v_recommended_value TEXT;
  v_recommended_text TEXT;
  v_recommended_rationale TEXT;
  v_payload_hash TEXT := public.document_evidence_sha256(p_payload::text);
  v_subject_kind TEXT;
  v_subject_key TEXT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'System document decision requires service_role' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'System decision requires accepted run' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_question FROM public.clarifying_questions
  WHERE id = (p_payload->>'question_id')::uuid AND course_id = p_course_id
    AND question_category = 'document_conflicts'
  FOR UPDATE;
  IF NOT FOUND OR v_question.metadata->>'run_id' IS DISTINCT FROM p_run_id::text THEN
    RAISE EXCEPTION 'System decision question scope mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), min(ordinality - 1),
         min(COALESCE(answer->>'value', answer->>'text')), min(answer->>'text'),
         min(answer->>'rationale')
  INTO v_recommended_count, v_recommended_index, v_recommended_value, v_recommended_text,
       v_recommended_rationale
  FROM jsonb_array_elements(v_question.suggested_answers) WITH ORDINALITY options(answer, ordinality)
  WHERE COALESCE((answer->>'is_recommended')::boolean, false);
  IF v_recommended_count <> 1 THEN
    RAISE EXCEPTION 'Question must contain exactly one recommended answer'
      USING ERRCODE = '23514';
  END IF;
  IF v_recommended_index IS DISTINCT FROM (p_payload->>'selected_recommendation_index')::integer
     OR v_recommended_value IS DISTINCT FROM p_payload->>'selected_recommendation_value' THEN
    RAISE EXCEPTION 'Selected system recommendation does not match question'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_existing FROM public.document_evidence_decisions
  WHERE run_id = p_run_id AND idempotency_key = (p_payload->>'idempotency_key')::uuid
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'Decision idempotency key has a changed payload' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'decision_id', v_existing.id, 'question_id', v_question.id, 'reused', true,
      'snapshot', public.refresh_document_evidence_decision_snapshot(p_course_id, p_run_id)
    );
  END IF;
  v_subject_kind := v_question.metadata->>'subject_kind';
  v_subject_key := v_question.metadata->>'subject_key';
  IF EXISTS (
    SELECT 1 FROM public.document_evidence_decisions decisions
    WHERE decisions.run_id = p_run_id AND decisions.subject_key = v_subject_key
      AND NOT EXISTS (
        SELECT 1 FROM public.document_evidence_decisions newer
        WHERE newer.supersedes_decision_id = decisions.id
      )
  ) THEN
    RAISE EXCEPTION 'Document evidence subject already has a current decision'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.document_evidence_decisions (
    run_id, conflict_id, course_id, organization_id, clarifying_question_id,
    selected_resolution, rationale, resolved_by, answer_source,
    selected_recommendation_index, selected_recommendation_value, decided_at,
    subject_kind, subject_key, document_id, idempotency_key, payload_hash
  ) VALUES (
    p_run_id,
    CASE WHEN v_subject_kind = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    p_course_id, p_organization_id, v_question.id,
    v_recommended_value, v_recommended_rationale, 'system', 'system',
    v_recommended_index, v_recommended_value, now(),
    v_subject_kind, v_subject_key,
    CASE WHEN v_subject_kind = 'degraded_evidence'
      THEN (v_question.metadata->>'document_id')::uuid END,
    (p_payload->>'idempotency_key')::uuid, v_payload_hash
  ) RETURNING * INTO v_decision;
  UPDATE public.clarifying_questions
  SET user_answer = jsonb_build_object('value', v_recommended_value),
      answer_source = 'system', selected_suggestion_index = v_recommended_index,
      status = 'answered', answered_at = v_decision.decided_at,
      metadata = v_question.metadata || jsonb_build_object('current_decision_id', v_decision.id)
  WHERE id = v_question.id;
  RETURN jsonb_build_object(
    'decision_id', v_decision.id, 'question_id', v_question.id, 'reused', false,
    'snapshot', public.refresh_document_evidence_decision_snapshot(p_course_id, p_run_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_document_evidence_question_atomic(
  p_question_id UUID,
  p_answer TEXT,
  p_answer_source TEXT,
  p_selected_recommendation_index INTEGER,
  p_idempotency_key UUID,
  p_expected_current_decision_id UUID,
  p_actor_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question public.clarifying_questions%ROWTYPE;
  v_run public.document_evidence_runs%ROWTYPE;
  v_current public.document_evidence_decisions%ROWTYPE;
  v_existing public.document_evidence_decisions%ROWTYPE;
  v_decision public.document_evidence_decisions%ROWTYPE;
  v_payload_hash TEXT;
  v_selected_value TEXT;
  v_selected_text TEXT;
BEGIN
  IF p_answer_source NOT IN ('suggested', 'modified', 'custom') THEN
    RAISE EXCEPTION 'User answer_source must be suggested, modified or custom'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_answer), '') IS NULL OR length(p_answer) > 5000 THEN
    RAISE EXCEPTION 'Document evidence answer text is invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_answer_source IN ('suggested', 'modified') AND p_selected_recommendation_index IS NULL)
     OR (p_answer_source = 'custom' AND p_selected_recommendation_index IS NOT NULL) THEN
    RAISE EXCEPTION 'Document evidence answer source/index shape is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Document evidence user decision requires an actor'
      USING ERRCODE = '23502';
  END IF;
  SELECT * INTO v_question FROM public.clarifying_questions
  WHERE id = p_question_id AND question_category = 'document_conflicts'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document evidence question not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = (v_question.metadata->>'run_id')::uuid AND course_id = v_question.course_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'User decision requires accepted run' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND v_run.organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid THEN
    RAISE EXCEPTION 'Document evidence answer access denied' USING ERRCODE = '42501';
  END IF;
  IF p_selected_recommendation_index IS NOT NULL THEN
    v_selected_text := v_question.suggested_answers -> p_selected_recommendation_index ->> 'text';
    v_selected_value := COALESCE(
      v_question.suggested_answers -> p_selected_recommendation_index ->> 'value',
      v_selected_text
    );
    IF v_selected_text IS NULL
       OR (p_answer_source = 'suggested' AND v_selected_text <> p_answer) THEN
      RAISE EXCEPTION 'Selected answer is outside the question options'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  v_payload_hash := public.document_evidence_sha256(jsonb_build_object(
    'course_id', v_question.course_id, 'run_id', v_run.id,
    'question_id', p_question_id, 'subject_key', v_question.metadata->>'subject_key',
    'actor_user_id', p_actor_user_id, 'answer', p_answer,
    'answer_source', p_answer_source, 'selected_index', p_selected_recommendation_index
  )::text);
  SELECT * INTO v_existing FROM public.document_evidence_decisions
  WHERE run_id = v_run.id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash
       OR v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_existing.course_id IS DISTINCT FROM v_question.course_id
       OR v_existing.clarifying_question_id IS DISTINCT FROM p_question_id
       OR v_existing.subject_key IS DISTINCT FROM v_question.metadata->>'subject_key' THEN
      RAISE EXCEPTION 'Decision idempotency key has a changed payload' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('decision_id', v_existing.id, 'reused', true);
  END IF;
  SELECT * INTO v_current FROM public.document_evidence_decisions decisions
  WHERE decisions.run_id = v_run.id
    AND decisions.subject_key = v_question.metadata->>'subject_key'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = decisions.id
    )
  FOR UPDATE;
  IF (v_current.id IS NULL AND p_expected_current_decision_id IS NOT NULL)
     OR (v_current.id IS NOT NULL AND p_expected_current_decision_id IS NULL)
     OR v_current.id IS DISTINCT FROM p_expected_current_decision_id THEN
    RAISE EXCEPTION 'stale current decision changed before user answer'
      USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.document_evidence_decisions (
    run_id, conflict_id, course_id, organization_id, clarifying_question_id,
    selected_resolution, rationale, resolved_by, answer_source,
    selected_recommendation_index, selected_recommendation_value,
    supersedes_decision_id, decided_at, subject_kind, subject_key, document_id,
    idempotency_key, payload_hash, actor_user_id
  ) VALUES (
    v_run.id,
    CASE WHEN v_question.metadata->>'subject_kind' = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    v_question.course_id, v_run.organization_id, v_question.id,
    p_answer, 'User selected or supplied this resolution.', 'user', p_answer_source,
    p_selected_recommendation_index, v_selected_value, v_current.id, now(),
    v_question.metadata->>'subject_kind', v_question.metadata->>'subject_key',
    CASE WHEN v_question.metadata->>'subject_kind' = 'degraded_evidence'
      THEN (v_question.metadata->>'document_id')::uuid END,
    p_idempotency_key, v_payload_hash, p_actor_user_id
  ) RETURNING * INTO v_decision;
  UPDATE public.clarifying_questions
  SET user_answer = jsonb_build_object('value', p_answer), answer_source = p_answer_source,
      selected_suggestion_index = p_selected_recommendation_index,
      status = 'answered', answered_at = v_decision.decided_at,
      metadata = v_question.metadata || jsonb_build_object('current_decision_id', v_decision.id)
  WHERE id = p_question_id;
  RETURN jsonb_build_object(
    'decision_id', v_decision.id, 'reused', false,
    'snapshot', public.refresh_document_evidence_decision_snapshot(v_question.course_id, v_run.id)
  );
END;
$$;

ALTER TABLE public.document_evidence_decisions
  DROP CONSTRAINT IF EXISTS document_evidence_decisions_side_handle_shape;
ALTER TABLE public.document_evidence_decisions
  DROP CONSTRAINT IF EXISTS document_evidence_decisions_side_handle_format;
ALTER TABLE public.document_evidence_decisions
  DROP COLUMN IF EXISTS selected_side_handle;

DROP TRIGGER IF EXISTS validate_document_evidence_conflict_side_identity
  ON public.document_evidence_conflicts;
DROP FUNCTION IF EXISTS public.validate_document_evidence_conflict_side_identity();

ALTER TABLE public.document_evidence_conflicts
  DISABLE TRIGGER prevent_document_evidence_conflicts_mutation;
UPDATE public.document_evidence_conflicts conflicts
SET sides = cleaned.sides
FROM (
  SELECT id, jsonb_agg(
    side - 'side_handle' - 'side_role' - 'alternative_index' ORDER BY ordinality
  ) AS sides
  FROM public.document_evidence_conflicts
  CROSS JOIN LATERAL jsonb_array_elements(sides) WITH ORDINALITY entries(side, ordinality)
  GROUP BY id
) cleaned
WHERE conflicts.id = cleaned.id;
ALTER TABLE public.document_evidence_conflicts
  ENABLE TRIGGER prevent_document_evidence_conflicts_mutation;

DROP FUNCTION IF EXISTS public.document_evidence_conflict_side_handle(UUID, JSONB);
