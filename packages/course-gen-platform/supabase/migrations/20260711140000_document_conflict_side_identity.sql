-- Durable, text-independent conflict-side identity for E3 -> E6 decisions.

CREATE OR REPLACE FUNCTION public.document_evidence_conflict_side_handle(
  p_conflict_id UUID,
  p_claim_ids JSONB
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_claim_identity TEXT;
BEGIN
  IF jsonb_typeof(p_claim_ids) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_claim_ids) = 0 THEN
    RAISE EXCEPTION 'Conflict side handle requires claim IDs' USING ERRCODE = '23514';
  END IF;
  SELECT string_agg(DISTINCT claim_id, ',' ORDER BY claim_id)
  INTO v_claim_identity
  FROM jsonb_array_elements_text(p_claim_ids) claim_id;
  RETURN 'side:v1:' || replace(
    public.document_evidence_sha256(
      'document-conflict-side-v1|' || p_conflict_id::text || '|' || v_claim_identity
    ),
    'sha256:',
    ''
  );
END;
$$;

ALTER TABLE public.document_evidence_decisions
  ADD COLUMN IF NOT EXISTS selected_side_handle TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_evidence_decisions_side_handle_format'
      AND conrelid = 'public.document_evidence_decisions'::regclass
  ) THEN
    ALTER TABLE public.document_evidence_decisions
      ADD CONSTRAINT document_evidence_decisions_side_handle_format
      CHECK (selected_side_handle IS NULL OR selected_side_handle ~ '^side:v1:[0-9a-f]{64}$')
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_evidence_decisions_side_handle_shape'
      AND conrelid = 'public.document_evidence_decisions'::regclass
  ) THEN
    ALTER TABLE public.document_evidence_decisions
      ADD CONSTRAINT document_evidence_decisions_side_handle_shape CHECK (
        (subject_kind = 'claim_conflict'
          AND answer_source IN ('system','suggested','modified')
          AND selected_side_handle IS NOT NULL)
        OR (subject_kind = 'claim_conflict'
          AND answer_source = 'custom'
          AND selected_side_handle IS NULL)
        OR (subject_kind <> 'claim_conflict' AND selected_side_handle IS NULL)
      ) NOT VALID;
  END IF;
END $$;

-- Existing conflicts are immutable at runtime. During this migration only, add a
-- handle to every side and add option roles only when exact claim text identifies
-- one side. Truncated/ambiguous legacy displays intentionally remain role-less.
ALTER TABLE public.document_evidence_conflicts
  DISABLE TRIGGER prevent_document_evidence_conflicts_mutation;
DO $$
DECLARE
  v_conflict public.document_evidence_conflicts%ROWTYPE;
  v_sides JSONB;
  v_recommended_handle TEXT;
  v_match_count INTEGER;
  v_alternative JSONB;
  v_alternative_handle TEXT;
BEGIN
  FOR v_conflict IN SELECT * FROM public.document_evidence_conflicts ORDER BY id LOOP
    SELECT jsonb_agg(
      side || jsonb_build_object(
        'side_handle', public.document_evidence_conflict_side_handle(
          v_conflict.id, side->'claim_ids'
        )
      ) ORDER BY ordinality
    ) INTO v_sides
    FROM jsonb_array_elements(v_conflict.sides) WITH ORDINALITY entries(side, ordinality);

    SELECT count(DISTINCT side->>'side_handle'), min(side->>'side_handle')
    INTO v_match_count, v_recommended_handle
    FROM jsonb_array_elements(v_sides) side
    WHERE EXISTS (
      SELECT 1
      FROM public.document_evidence_items items
      CROSS JOIN LATERAL jsonb_array_elements(items.claims) claim
      WHERE items.run_id = v_conflict.run_id
        AND side->'claim_ids' ? (claim->>'claim_id')
        AND claim->>'statement' = v_conflict.recommended_resolution
    );
    IF v_match_count = 1 THEN
      SELECT jsonb_agg(
        CASE WHEN side->>'side_handle' = v_recommended_handle
          THEN side || jsonb_build_object('side_role','recommended')
          ELSE side END ORDER BY ordinality
      ) INTO v_sides
      FROM jsonb_array_elements(v_sides) WITH ORDINALITY entries(side, ordinality);
    ELSE
      v_recommended_handle := NULL;
    END IF;

    FOR v_alternative IN
      SELECT jsonb_build_object('text', value, 'index', ordinality - 1) AS entry
      FROM jsonb_array_elements_text(v_conflict.alternatives)
        WITH ORDINALITY alternatives(value, ordinality)
    LOOP
      SELECT count(DISTINCT side->>'side_handle'), min(side->>'side_handle')
      INTO v_match_count, v_alternative_handle
      FROM jsonb_array_elements(v_sides) side
      WHERE side->>'side_handle' IS DISTINCT FROM v_recommended_handle
        AND EXISTS (
          SELECT 1
          FROM public.document_evidence_items items
          CROSS JOIN LATERAL jsonb_array_elements(items.claims) claim
          WHERE items.run_id = v_conflict.run_id
            AND side->'claim_ids' ? (claim->>'claim_id')
            AND claim->>'statement' = v_alternative->>'text'
        );
      IF v_match_count = 1 THEN
        SELECT jsonb_agg(
          CASE WHEN side->>'side_handle' = v_alternative_handle
            THEN side || jsonb_build_object(
              'side_role','alternative',
              'alternative_index',(v_alternative->>'index')::integer
            )
            ELSE side END ORDER BY ordinality
        ) INTO v_sides
        FROM jsonb_array_elements(v_sides) WITH ORDINALITY entries(side, ordinality);
      END IF;
    END LOOP;

    UPDATE public.document_evidence_conflicts SET sides = v_sides WHERE id = v_conflict.id;
  END LOOP;
END $$;
ALTER TABLE public.document_evidence_conflicts
  ENABLE TRIGGER prevent_document_evidence_conflicts_mutation;

CREATE OR REPLACE FUNCTION public.validate_document_evidence_conflict_side_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_side JSONB;
  v_recommended_count INTEGER;
  v_alternative_count INTEGER;
BEGIN
  FOR v_side IN SELECT value FROM jsonb_array_elements(NEW.sides) LOOP
    IF v_side->>'side_handle' IS DISTINCT FROM
       public.document_evidence_conflict_side_handle(NEW.id, v_side->'claim_ids') THEN
      RAISE EXCEPTION 'Conflict side handle does not match claim identity'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  SELECT count(*) FILTER (WHERE side->>'side_role' = 'recommended'),
         count(*) FILTER (WHERE side->>'side_role' = 'alternative')
  INTO v_recommended_count, v_alternative_count
  FROM jsonb_array_elements(NEW.sides) side;
  IF v_recommended_count <> 1
     OR v_alternative_count <> jsonb_array_length(NEW.alternatives)
     OR EXISTS (
       SELECT 1
       FROM generate_series(0, jsonb_array_length(NEW.alternatives) - 1) expected(index)
       WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(NEW.sides) side
         WHERE side->>'side_role' = 'alternative'
           AND NULLIF(side->>'alternative_index','')::integer = expected.index
       )
     ) THEN
    RAISE EXCEPTION 'Conflict side option roles are incomplete or ambiguous'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_document_evidence_conflict_side_identity
  ON public.document_evidence_conflicts;
CREATE TRIGGER validate_document_evidence_conflict_side_identity
  BEFORE INSERT ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_conflict_side_identity();

-- Backfill legacy decisions only from a durable role or exact side-handle value.
-- Custom answers never acquire an inferred side.
ALTER TABLE public.document_evidence_decisions
  DISABLE TRIGGER prevent_document_evidence_decisions_mutation;
WITH candidates AS (
  SELECT decisions.id AS decision_id,
         min(side->>'side_handle') AS side_handle,
         count(DISTINCT side->>'side_handle') AS match_count
  FROM public.document_evidence_decisions decisions
  JOIN public.document_evidence_conflicts conflicts ON conflicts.id = decisions.conflict_id
  CROSS JOIN LATERAL jsonb_array_elements(conflicts.sides) side
  WHERE decisions.subject_kind = 'claim_conflict'
    AND decisions.answer_source <> 'custom'
    AND decisions.selected_side_handle IS NULL
    AND (
      decisions.selected_recommendation_value = side->>'side_handle'
      OR (decisions.selected_recommendation_value = 'recommendation:' || conflicts.id::text
          AND side->>'side_role' = 'recommended')
      OR (decisions.selected_recommendation_value =
            'alternative:' || conflicts.id::text || ':' || (side->>'alternative_index')
          AND side->>'side_role' = 'alternative')
    )
  GROUP BY decisions.id
)
UPDATE public.document_evidence_decisions decisions
SET selected_side_handle = candidates.side_handle
FROM candidates
WHERE decisions.id = candidates.decision_id
  AND candidates.match_count = 1;
ALTER TABLE public.document_evidence_decisions
  ENABLE TRIGGER prevent_document_evidence_decisions_mutation;

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
  v_selected_side_handle TEXT;
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
  IF v_subject_kind = 'claim_conflict' THEN
    v_selected_side_handle := v_recommended_value;
    IF v_selected_side_handle !~ '^side:v1:[0-9a-f]{64}$'
       OR v_question.metadata->>'recommended_side_handle' IS DISTINCT FROM v_selected_side_handle
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_question.metadata->'sides') side
         WHERE side->>'side_handle' = v_selected_side_handle
       ) THEN
      RAISE EXCEPTION 'System claim decision lacks durable recommended side identity'
        USING ERRCODE = '23514';
    END IF;
  END IF;
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
    selected_recommendation_index, selected_recommendation_value, selected_side_handle,
    decided_at, subject_kind, subject_key, document_id, idempotency_key, payload_hash
  ) VALUES (
    p_run_id,
    CASE WHEN v_subject_kind = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    p_course_id, p_organization_id, v_question.id,
    v_recommended_value, v_recommended_rationale, 'system', 'system',
    v_recommended_index, v_recommended_value, v_selected_side_handle, now(),
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
  v_selected_side_handle TEXT;
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
  IF v_question.metadata->>'subject_kind' = 'claim_conflict'
     AND p_answer_source IN ('suggested','modified') THEN
    v_selected_side_handle := v_selected_value;
    IF v_selected_side_handle !~ '^side:v1:[0-9a-f]{64}$'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_question.metadata->'sides') side
         WHERE side->>'side_handle' = v_selected_side_handle
       ) THEN
      RAISE EXCEPTION 'User claim decision lacks durable selected side identity'
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
    selected_recommendation_index, selected_recommendation_value, selected_side_handle,
    supersedes_decision_id, decided_at, subject_kind, subject_key, document_id,
    idempotency_key, payload_hash, actor_user_id
  ) VALUES (
    v_run.id,
    CASE WHEN v_question.metadata->>'subject_kind' = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    v_question.course_id, v_run.organization_id, v_question.id,
    p_answer, 'User selected or supplied this resolution.', 'user', p_answer_source,
    p_selected_recommendation_index, v_selected_value, v_selected_side_handle,
    v_current.id, now(), v_question.metadata->>'subject_kind',
    v_question.metadata->>'subject_key',
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
