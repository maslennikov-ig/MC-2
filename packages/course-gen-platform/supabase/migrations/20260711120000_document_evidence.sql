-- Durable advisory document evidence for Stage 4.
-- Full evidence remains in these tenant-scoped tables; courses.analysis_result
-- stores only a compact accepted-run snapshot.

CREATE TABLE public.document_evidence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  input_fingerprint TEXT NOT NULL CHECK (btrim(input_fingerprint) <> ''),
  evidence_version TEXT NOT NULL CHECK (btrim(evidence_version) <> ''),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'accepted', 'failed')),
  source_manifest JSONB NOT NULL CHECK (jsonb_typeof(source_manifest) = 'array'),
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  assessed_count INTEGER NOT NULL DEFAULT 0 CHECK (assessed_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  batch_count INTEGER NOT NULL DEFAULT 0 CHECK (batch_count >= 0),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0 CHECK (total_cost_usd >= 0),
  conflict_summary JSONB NOT NULL DEFAULT '{"critical":0,"important":0,"informational":0}'::jsonb,
  decision_summary JSONB NOT NULL DEFAULT '{"user":0,"system":0,"unresolved":0}'::jsonb,
  error_category TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_runs_identity_unique
    UNIQUE (course_id, input_fingerprint, evidence_version),
  CONSTRAINT document_evidence_runs_source_set_count CHECK (
    source_count = jsonb_array_length(source_manifest)
  ),
  CONSTRAINT document_evidence_runs_coverage_bounds CHECK (
    assessed_count + degraded_count + failed_count <= source_count
  ),
  CONSTRAINT document_evidence_runs_accepted_coverage CHECK (
    status <> 'accepted'
    OR assessed_count + degraded_count + failed_count = source_count
  ),
  CONSTRAINT document_evidence_runs_completion CHECK (
    (status IN ('accepted', 'failed') AND completed_at IS NOT NULL)
    OR (status IN ('pending', 'processing') AND completed_at IS NULL)
  )
);

CREATE TABLE public.document_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  source_version_hash TEXT NOT NULL CHECK (btrim(source_version_hash) <> ''),
  document_name TEXT NOT NULL CHECK (btrim(document_name) <> ''),
  priority TEXT NOT NULL CHECK (priority IN ('CORE', 'IMPORTANT', 'SUPPLEMENTARY')),
  authority_scope TEXT NOT NULL CHECK (
    authority_scope IN ('organization_specific', 'course_source', 'general_reference', 'unknown')
  ),
  content_quality DOUBLE PRECISION NOT NULL CHECK (content_quality BETWEEN 0 AND 1),
  course_relevance DOUBLE PRECISION NOT NULL CHECK (course_relevance BETWEEN 0 AND 1),
  processing_mode TEXT NOT NULL CHECK (
    processing_mode IN (
      'full_text', 'hierarchical_summary', 'summary', 'targeted_retrieval', 'metadata_only'
    )
  ),
  summary TEXT,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claims) = 'array'),
  terminology JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(terminology) = 'array'),
  constraints JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('assessed', 'degraded', 'failed')),
  coverage_reason TEXT NOT NULL CHECK (btrim(coverage_reason) <> ''),
  original_tokens INTEGER NOT NULL CHECK (original_tokens >= 0),
  summary_tokens INTEGER NOT NULL CHECK (summary_tokens >= 0),
  allocated_tokens INTEGER NOT NULL CHECK (allocated_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_items_run_document_unique UNIQUE (run_id, document_id),
  CONSTRAINT document_evidence_items_summary_by_coverage CHECK (
    (coverage_status = 'assessed' AND summary IS NOT NULL AND btrim(summary) <> '')
    OR (
      coverage_status IN ('degraded', 'failed')
      AND (summary IS NULL OR btrim(summary) <> '')
    )
  )
);

CREATE TABLE public.document_evidence_batch_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL CHECK (btrim(batch_key) <> ''),
  input_hash TEXT NOT NULL CHECK (btrim(input_hash) <> ''),
  structured_checkpoint JSONB NOT NULL CHECK (jsonb_typeof(structured_checkpoint) = 'object'),
  cursor JSONB NOT NULL CHECK (jsonb_typeof(cursor) = 'object'),
  batch_count INTEGER NOT NULL CHECK (batch_count >= 0),
  model_calls INTEGER NOT NULL CHECK (model_calls >= 0),
  input_tokens BIGINT NOT NULL CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL CHECK (output_tokens >= 0),
  total_cost_usd NUMERIC(14, 6) NOT NULL CHECK (total_cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_batch_checkpoint_unique UNIQUE (run_id, batch_key)
);

CREATE TABLE public.document_evidence_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conflict_fingerprint TEXT NOT NULL CHECK (btrim(conflict_fingerprint) <> ''),
  topic TEXT NOT NULL CHECK (btrim(topic) <> ''),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'important', 'informational')),
  sides JSONB NOT NULL CHECK (jsonb_typeof(sides) = 'array' AND jsonb_array_length(sides) >= 2),
  claim_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claim_ids) = 'array'),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  course_impact TEXT NOT NULL CHECK (btrim(course_impact) <> ''),
  recommended_resolution TEXT NOT NULL CHECK (btrim(recommended_resolution) <> ''),
  recommendation_rationale TEXT NOT NULL CHECK (btrim(recommendation_rationale) <> ''),
  alternatives JSONB NOT NULL CHECK (
    jsonb_typeof(alternatives) = 'array' AND jsonb_array_length(alternatives) >= 1
  ),
  detection_model TEXT NOT NULL CHECK (btrim(detection_model) <> ''),
  detection_version TEXT NOT NULL CHECK (btrim(detection_version) <> ''),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_conflicts_run_fingerprint_unique
    UNIQUE (run_id, conflict_fingerprint)
);

CREATE TABLE public.document_evidence_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  conflict_id UUID NOT NULL REFERENCES public.document_evidence_conflicts(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  clarifying_question_id UUID REFERENCES public.clarifying_questions(id) ON DELETE SET NULL,
  selected_resolution TEXT NOT NULL CHECK (btrim(selected_resolution) <> ''),
  rationale TEXT NOT NULL CHECK (btrim(rationale) <> ''),
  resolved_by TEXT NOT NULL CHECK (resolved_by IN ('user', 'system')),
  answer_source TEXT NOT NULL CHECK (answer_source IN ('suggested', 'modified', 'custom', 'system')),
  selected_recommendation_index INTEGER CHECK (selected_recommendation_index >= 0),
  selected_recommendation_value TEXT,
  supersedes_decision_id UUID REFERENCES public.document_evidence_decisions(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_decisions_supersedes_unique UNIQUE (supersedes_decision_id),
  CONSTRAINT document_evidence_decisions_not_self_superseding
    CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id),
  CONSTRAINT document_evidence_decisions_system_source CHECK (
    (resolved_by = 'system') = (answer_source = 'system')
  ),
  CONSTRAINT document_evidence_decisions_user_override CHECK (
    supersedes_decision_id IS NULL OR resolved_by = 'user'
  )
);

CREATE UNIQUE INDEX document_evidence_decisions_one_chain_root
  ON public.document_evidence_decisions(conflict_id)
  WHERE supersedes_decision_id IS NULL;

CREATE INDEX document_evidence_runs_course_status_idx
  ON public.document_evidence_runs(course_id, status, created_at DESC);
CREATE INDEX document_evidence_runs_organization_idx
  ON public.document_evidence_runs(organization_id, created_at DESC);
CREATE INDEX document_evidence_items_course_idx
  ON public.document_evidence_items(course_id, document_id);
CREATE INDEX document_evidence_conflicts_course_severity_idx
  ON public.document_evidence_conflicts(course_id, severity, detected_at DESC);
CREATE INDEX document_evidence_decisions_run_decided_idx
  ON public.document_evidence_decisions(run_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.set_document_evidence_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_document_evidence_runs_updated_at
  BEFORE UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_document_evidence_updated_at();

CREATE TRIGGER set_document_evidence_items_updated_at
  BEFORE UPDATE ON public.document_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.set_document_evidence_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_document_evidence_source_manifest(p_manifest JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_normalized JSONB;
  v_input_count INTEGER;
  v_distinct_count INTEGER;
BEGIN
  IF jsonb_typeof(p_manifest) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_manifest) = 0 THEN
    RAISE EXCEPTION 'Evidence source manifest must be a non-empty JSON array'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_manifest) source
    WHERE jsonb_typeof(source) IS DISTINCT FROM 'object'
      OR NOT (source ? 'document_id' AND source ? 'source_version_hash' AND source ? 'document_name')
      OR NULLIF(btrim(source->>'source_version_hash'), '') IS NULL
      OR NULLIF(btrim(source->>'document_name'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Evidence source manifest entries are invalid' USING ERRCODE = '23514';
  END IF;

  BEGIN
    SELECT count(*), count(DISTINCT (source->>'document_id')::UUID)
      INTO v_input_count, v_distinct_count
    FROM jsonb_array_elements(p_manifest) source;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Evidence source manifest document_id must be UUID'
      USING ERRCODE = '23514';
  END;

  IF v_input_count <> v_distinct_count THEN
    RAISE EXCEPTION 'Evidence source manifest document_id values must be unique'
      USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'document_id', (source->>'document_id')::UUID,
      'source_version_hash', source->>'source_version_hash',
      'document_name', source->>'document_name'
    ) ORDER BY (source->>'document_id')::UUID
  ) INTO v_normalized
  FROM jsonb_array_elements(p_manifest) source;

  RETURN v_normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_document_evidence_run_source_manifest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_normalized JSONB;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.source_manifest IS DISTINCT FROM OLD.source_manifest
       OR NEW.source_count IS DISTINCT FROM OLD.source_count
     ) THEN
    RAISE EXCEPTION 'Evidence run source manifest is immutable' USING ERRCODE = '55000';
  END IF;

  v_normalized := public.normalize_document_evidence_source_manifest(NEW.source_manifest);
  NEW.source_manifest := v_normalized;
  NEW.source_count := jsonb_array_length(v_normalized);
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_document_evidence_run_source_manifest
  BEFORE INSERT OR UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_evidence_run_source_manifest();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_run_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = NEW.course_id
      AND courses.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Document evidence run tenant does not match course'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_run_tenant
  BEFORE INSERT OR UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_run_tenant();

CREATE OR REPLACE FUNCTION public.prevent_document_evidence_terminal_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF OLD.status IN ('accepted', 'failed') THEN
    RAISE EXCEPTION 'Terminal evidence runs are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER prevent_document_evidence_terminal_run_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_document_evidence_terminal_run_mutation();

CREATE OR REPLACE FUNCTION public.verify_document_evidence_terminal_coverage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source_document_ids UUID[];
  v_item_document_ids UUID[];
  v_assessed_count INTEGER;
  v_degraded_count INTEGER;
  v_failed_count INTEGER;
BEGIN
  IF NEW.status NOT IN ('accepted', 'failed')
     OR OLD.status IN ('accepted', 'failed') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg((source->>'document_id')::UUID ORDER BY (source->>'document_id')::UUID), '{}'::UUID[])
    INTO v_source_document_ids
  FROM jsonb_array_elements(NEW.source_manifest) source;

  SELECT
    COALESCE(array_agg(document_id ORDER BY document_id), '{}'::UUID[]),
    count(*) FILTER (WHERE coverage_status = 'assessed'),
    count(*) FILTER (WHERE coverage_status = 'degraded'),
    count(*) FILTER (WHERE coverage_status = 'failed')
  INTO v_item_document_ids, v_assessed_count, v_degraded_count, v_failed_count
  FROM public.document_evidence_items
  WHERE run_id = NEW.id;

  IF v_item_document_ids IS DISTINCT FROM v_source_document_ids
     OR NEW.source_count <> cardinality(v_item_document_ids)
     OR NEW.assessed_count <> v_assessed_count
     OR NEW.degraded_count <> v_degraded_count
     OR NEW.failed_count <> v_failed_count THEN
    RAISE EXCEPTION 'Terminal evidence run requires exact durable coverage'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verify_document_evidence_terminal_coverage
  BEFORE UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.verify_document_evidence_terminal_coverage();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.document_evidence_runs runs
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(runs.source_manifest) source
        WHERE (source->>'document_id')::UUID = NEW.document_id
          AND source->>'source_version_hash' = NEW.source_version_hash
          AND source->>'document_name' = NEW.document_name
      )
  ) THEN
    RAISE EXCEPTION 'Document evidence item scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_item_scope
  BEFORE INSERT OR UPDATE ON public.document_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_item_scope();

CREATE OR REPLACE FUNCTION public.prevent_document_evidence_terminal_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  SELECT status INTO v_run_status
  FROM public.document_evidence_runs
  WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  IF v_run_status IN ('accepted', 'failed') THEN
    RAISE EXCEPTION 'Terminal evidence items are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER prevent_document_evidence_terminal_item_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.document_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_document_evidence_terminal_item_mutation();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_conflict_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs runs
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Document evidence conflict scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_conflict_scope
  BEFORE INSERT ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_conflict_scope();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_decision_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_organization_id UUID;
  v_prior_run_id UUID;
  v_prior_conflict_id UUID;
BEGIN
  SELECT conflicts.course_id, conflicts.organization_id
    INTO v_course_id, v_organization_id
  FROM public.document_evidence_conflicts conflicts
  WHERE conflicts.id = NEW.conflict_id
    AND conflicts.run_id = NEW.run_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Decision conflict does not belong to run' USING ERRCODE = '23514';
  END IF;

  NEW.course_id := v_course_id;
  NEW.organization_id := v_organization_id;

  IF NEW.supersedes_decision_id IS NOT NULL THEN
    SELECT decisions.run_id, decisions.conflict_id
      INTO v_prior_run_id, v_prior_conflict_id
    FROM public.document_evidence_decisions decisions
    WHERE decisions.id = NEW.supersedes_decision_id;

    IF v_prior_run_id IS DISTINCT FROM NEW.run_id
       OR v_prior_conflict_id IS DISTINCT FROM NEW.conflict_id THEN
      RAISE EXCEPTION 'Superseded decision must be in the same run and conflict chain'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_decision_chain
  BEFORE INSERT ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_decision_chain();

CREATE OR REPLACE FUNCTION public.reject_document_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Permit referential-action cascades while rejecting direct row mutation.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are immutable and append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_document_evidence_conflicts_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_mutation();

CREATE TRIGGER prevent_document_evidence_decisions_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_mutation();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_batch_checkpoint_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs runs
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Evidence batch checkpoint scope does not match run'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_batch_checkpoint_scope
  BEFORE INSERT OR UPDATE ON public.document_evidence_batch_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_batch_checkpoint_scope();

CREATE TRIGGER prevent_document_evidence_batch_checkpoint_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_batch_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_mutation();

CREATE OR REPLACE FUNCTION public.create_or_reuse_document_evidence_run(
  p_course_id UUID,
  p_organization_id UUID,
  p_input_fingerprint TEXT,
  p_evidence_version TEXT,
  p_source_manifest JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manifest JSONB;
  v_run public.document_evidence_runs%ROWTYPE;
  v_reused BOOLEAN;
BEGIN
  IF NULLIF(btrim(p_input_fingerprint), '') IS NULL
     OR NULLIF(btrim(p_evidence_version), '') IS NULL THEN
    RAISE EXCEPTION 'Evidence run identity is invalid' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = p_course_id
      AND courses.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Evidence run tenant does not match course' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND p_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;

  v_manifest := public.normalize_document_evidence_source_manifest(p_source_manifest);
  INSERT INTO public.document_evidence_runs (
    course_id, organization_id, input_fingerprint, evidence_version, status, source_manifest
  ) VALUES (
    p_course_id, p_organization_id, p_input_fingerprint, p_evidence_version, 'processing', v_manifest
  )
  ON CONFLICT (course_id, input_fingerprint, evidence_version) DO NOTHING
  RETURNING * INTO v_run;
  v_reused := NOT FOUND;

  IF v_reused THEN
    SELECT * INTO v_run
    FROM public.document_evidence_runs
    WHERE course_id = p_course_id
      AND organization_id = p_organization_id
      AND input_fingerprint = p_input_fingerprint
      AND evidence_version = p_evidence_version
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Evidence run identity belongs to another tenant'
        USING ERRCODE = '23514';
    END IF;
    IF v_run.source_manifest IS DISTINCT FROM v_manifest THEN
      RAISE EXCEPTION 'Evidence run source manifest mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN jsonb_build_object('run', to_jsonb(v_run), 'reused', v_reused);
END;
$$;

-- Atomic replacement/checkpoint of the complete coverage ledger. PostgreSQL
-- functions execute in the caller transaction, so item rows and run counts
-- cannot diverge.
CREATE OR REPLACE FUNCTION public.persist_document_evidence_items(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_manifest JSONB;
  v_source_document_ids UUID[];
  v_item_document_ids UUID[];
  v_source_count INTEGER;
  v_item_count INTEGER;
  v_assessed_count INTEGER;
  v_degraded_count INTEGER;
  v_failed_count INTEGER;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Evidence items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT runs.source_manifest, runs.source_count
    INTO v_source_manifest, v_source_count
  FROM public.document_evidence_runs runs
  WHERE runs.id = p_run_id
    AND runs.course_id = p_course_id
    AND runs.organization_id = p_organization_id
  FOR UPDATE;

  IF v_source_count IS NULL THEN
    RAISE EXCEPTION 'Evidence run scope mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_evidence_runs
    WHERE id = p_run_id AND status IN ('accepted', 'failed')
  ) THEN
    RAISE EXCEPTION 'Terminal evidence run cannot replace items' USING ERRCODE = '55000';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
     ) THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    array_agg((source->>'document_id')::UUID ORDER BY (source->>'document_id')::UUID),
    '{}'::UUID[]
  ) INTO v_source_document_ids
  FROM jsonb_array_elements(v_source_manifest) source;

  SELECT count(*) INTO v_item_count
  FROM jsonb_array_elements(p_items) item;

  SELECT COALESCE(array_agg(document_id ORDER BY document_id), '{}'::uuid[])
    INTO v_item_document_ids
  FROM (
    SELECT DISTINCT (item->>'document_id')::uuid AS document_id
    FROM jsonb_array_elements(p_items) item
  ) normalized_items;

  IF v_item_count <> cardinality(v_item_document_ids)
     OR v_item_document_ids IS DISTINCT FROM v_source_document_ids THEN
    RAISE EXCEPTION 'Evidence coverage must contain every source document exactly once'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.document_evidence_items WHERE run_id = p_run_id;

  INSERT INTO public.document_evidence_items (
    run_id, course_id, organization_id, document_id, source_version_hash,
    document_name, priority, authority_scope, content_quality, course_relevance,
    processing_mode, summary, claims, terminology, constraints, limitations,
    coverage_status, coverage_reason, original_tokens, summary_tokens, allocated_tokens
  )
  SELECT
    p_run_id,
    p_course_id,
    p_organization_id,
    (item->>'document_id')::uuid,
    source->>'source_version_hash',
    source->>'document_name',
    item->>'priority',
    item->>'authority_scope',
    (item->>'content_quality')::double precision,
    (item->>'course_relevance')::double precision,
    item->>'processing_mode',
    item->>'summary',
    COALESCE(item->'key_claims', '[]'::jsonb),
    COALESCE(item->'terminology', '[]'::jsonb),
    COALESCE(item->'constraints', '[]'::jsonb),
    COALESCE(item->'limitations', '[]'::jsonb),
    item->>'coverage_status',
    item->>'coverage_reason',
    (item->'token_counts'->>'original')::integer,
    (item->'token_counts'->>'summary')::integer,
    (item->'token_counts'->>'allocated')::integer
  FROM jsonb_array_elements(p_items) item
  JOIN jsonb_array_elements(v_source_manifest) source
    ON (source->>'document_id')::UUID = (item->>'document_id')::UUID;

  IF (SELECT count(*) FROM public.document_evidence_items WHERE run_id = p_run_id)
     <> v_source_count THEN
    RAISE EXCEPTION 'Evidence item/source mismatch after persistence' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE coverage_status = 'assessed'),
    count(*) FILTER (WHERE coverage_status = 'degraded'),
    count(*) FILTER (WHERE coverage_status = 'failed')
  INTO v_assessed_count, v_degraded_count, v_failed_count
  FROM public.document_evidence_items
  WHERE run_id = p_run_id;

  UPDATE public.document_evidence_runs
  SET assessed_count = v_assessed_count,
      degraded_count = v_degraded_count,
      failed_count = v_failed_count
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'source_count', v_source_count,
    'assessed_count', v_assessed_count,
    'degraded_count', v_degraded_count,
    'failed_count', v_failed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_document_evidence_run(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('accepted', 'failed') THEN
    RAISE EXCEPTION 'Evidence terminal status must be accepted or failed'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_run
  FROM public.document_evidence_runs
  WHERE id = p_run_id
    AND course_id = p_course_id
    AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence run scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND p_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;
  IF v_run.status IN ('accepted', 'failed') THEN
    IF v_run.status IS DISTINCT FROM p_status THEN
      RAISE EXCEPTION 'Evidence run already has a different terminal status'
        USING ERRCODE = '55000';
    END IF;
    RETURN to_jsonb(v_run);
  END IF;

  UPDATE public.document_evidence_runs
  SET status = p_status,
      completed_at = now()
  WHERE id = p_run_id
  RETURNING * INTO v_run;
  RETURN to_jsonb(v_run);
END;
$$;

-- Absolute cumulative progress checkpoint. Values are monotonic so a retry can
-- safely replay the same checkpoint without double-counting completed work.
CREATE OR REPLACE FUNCTION public.checkpoint_document_evidence_run_metrics(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_batch_count INTEGER,
  p_model_calls INTEGER,
  p_input_tokens BIGINT,
  p_output_tokens BIGINT,
  p_total_cost_usd NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
BEGIN
  IF p_batch_count IS NULL OR p_batch_count < 0
     OR p_model_calls IS NULL OR p_model_calls < 0
     OR p_input_tokens IS NULL OR p_input_tokens < 0
     OR p_output_tokens IS NULL OR p_output_tokens < 0
     OR p_total_cost_usd IS NULL OR p_total_cost_usd < 0 THEN
    RAISE EXCEPTION 'Evidence run metrics must be nonnegative'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
  FROM public.document_evidence_runs
  WHERE id = p_run_id
    AND course_id = p_course_id
    AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence run scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND p_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;
  IF v_run.status IN ('accepted', 'failed') THEN
    RAISE EXCEPTION 'Terminal evidence run metrics are immutable' USING ERRCODE = '55000';
  END IF;
  IF p_batch_count < v_run.batch_count
     OR p_model_calls < v_run.model_calls
     OR p_input_tokens < v_run.input_tokens
     OR p_output_tokens < v_run.output_tokens
     OR p_total_cost_usd < v_run.total_cost_usd THEN
    RAISE EXCEPTION 'Evidence run metrics cannot decrease' USING ERRCODE = '23514';
  END IF;

  UPDATE public.document_evidence_runs
  SET batch_count = p_batch_count,
      model_calls = p_model_calls,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_cost_usd = p_total_cost_usd
  WHERE id = p_run_id
  RETURNING * INTO v_run;
  RETURN to_jsonb(v_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_document_evidence_batch(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_batch_key TEXT,
  p_input_hash TEXT,
  p_items JSONB,
  p_structured_checkpoint JSONB,
  p_cursor JSONB,
  p_batch_count INTEGER,
  p_model_calls INTEGER,
  p_input_tokens BIGINT,
  p_output_tokens BIGINT,
  p_total_cost_usd NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_existing public.document_evidence_batch_checkpoints%ROWTYPE;
  v_checkpoint public.document_evidence_batch_checkpoints%ROWTYPE;
  v_coverage JSONB;
  v_metrics JSONB;
BEGIN
  IF NULLIF(btrim(p_batch_key), '') IS NULL OR NULLIF(btrim(p_input_hash), '') IS NULL
     OR jsonb_typeof(p_structured_checkpoint) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Evidence batch checkpoint payload is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
  FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence run scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND p_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;
  IF v_run.status IN ('accepted', 'failed') THEN
    RAISE EXCEPTION 'Terminal evidence run cannot accept batch checkpoints'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_existing
  FROM public.document_evidence_batch_checkpoints
  WHERE run_id = p_run_id AND batch_key = p_batch_key;
  IF FOUND THEN
    IF v_existing.input_hash IS DISTINCT FROM p_input_hash THEN
      RAISE EXCEPTION 'Evidence batch key already has a different input hash'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'checkpoint', to_jsonb(v_existing),
      'run', to_jsonb(v_run),
      'reused', true
    );
  END IF;

  v_coverage := public.persist_document_evidence_items(
    p_run_id, p_course_id, p_organization_id, p_items
  );
  v_metrics := public.checkpoint_document_evidence_run_metrics(
    p_run_id, p_course_id, p_organization_id,
    p_batch_count, p_model_calls, p_input_tokens, p_output_tokens, p_total_cost_usd
  );
  INSERT INTO public.document_evidence_batch_checkpoints (
    run_id, course_id, organization_id, batch_key, input_hash,
    structured_checkpoint, cursor, batch_count, model_calls,
    input_tokens, output_tokens, total_cost_usd
  ) VALUES (
    p_run_id, p_course_id, p_organization_id, p_batch_key, p_input_hash,
    p_structured_checkpoint, p_cursor, p_batch_count, p_model_calls,
    p_input_tokens, p_output_tokens, p_total_cost_usd
  ) RETURNING * INTO v_checkpoint;
  RETURN jsonb_build_object(
    'checkpoint', to_jsonb(v_checkpoint),
    'coverage', v_coverage,
    'run', v_metrics,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_document_evidence_conflict(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_conflict JSONB,
  p_detection_model TEXT,
  p_detection_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict public.document_evidence_conflicts%ROWTYPE;
  v_claim_ids JSONB;
  v_source_refs JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs
    WHERE id = p_run_id
      AND course_id = p_course_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Evidence conflict scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND p_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence conflict access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT claim_id), '[]'::JSONB)
    INTO v_claim_ids
  FROM jsonb_array_elements(COALESCE(p_conflict->'sides', '[]'::JSONB)) side
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(side->'claim_ids', '[]'::JSONB)) claim_id;

  SELECT COALESCE(jsonb_agg(DISTINCT source_ref), '[]'::JSONB)
    INTO v_source_refs
  FROM jsonb_array_elements(COALESCE(p_conflict->'sides', '[]'::JSONB)) side
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(side->'source_refs', '[]'::JSONB)) source_ref;

  INSERT INTO public.document_evidence_conflicts (
    id, run_id, course_id, organization_id, conflict_fingerprint, topic, severity,
    sides, claim_ids, source_refs, course_impact, recommended_resolution,
    recommendation_rationale, alternatives, detection_model, detection_version
  ) VALUES (
    (p_conflict->>'conflict_id')::UUID,
    p_run_id,
    p_course_id,
    p_organization_id,
    p_conflict->>'conflict_fingerprint',
    p_conflict->>'topic',
    p_conflict->>'severity',
    p_conflict->'sides',
    v_claim_ids,
    v_source_refs,
    p_conflict->>'course_impact',
    p_conflict->>'recommended_resolution',
    p_conflict->>'recommendation_rationale',
    p_conflict->'alternatives',
    p_detection_model,
    p_detection_version
  )
  ON CONFLICT (run_id, conflict_fingerprint) DO NOTHING
  RETURNING * INTO v_conflict;

  IF NOT FOUND THEN
    SELECT * INTO v_conflict
    FROM public.document_evidence_conflicts
    WHERE run_id = p_run_id
      AND conflict_fingerprint = p_conflict->>'conflict_fingerprint';
  END IF;
  RETURN to_jsonb(v_conflict);
END;
$$;

CREATE OR REPLACE FUNCTION public.append_document_evidence_decision(p_decision JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_organization_id UUID;
  v_decision public.document_evidence_decisions%ROWTYPE;
BEGIN
  SELECT conflicts.course_id, conflicts.organization_id
    INTO v_course_id, v_organization_id
  FROM public.document_evidence_conflicts conflicts
  WHERE conflicts.id = (p_decision->>'conflict_id')::UUID
    AND conflicts.run_id = (p_decision->>'run_id')::UUID;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Decision conflict does not belong to run' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND v_organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::UUID THEN
    RAISE EXCEPTION 'Evidence decision access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.document_evidence_decisions (
    id, run_id, conflict_id, course_id, organization_id, clarifying_question_id,
    selected_resolution, rationale, resolved_by, answer_source,
    selected_recommendation_index, selected_recommendation_value,
    supersedes_decision_id, decided_at
  ) VALUES (
    COALESCE(NULLIF(p_decision->>'decision_id', '')::UUID, gen_random_uuid()),
    (p_decision->>'run_id')::UUID,
    (p_decision->>'conflict_id')::UUID,
    v_course_id,
    v_organization_id,
    NULLIF(p_decision->>'clarifying_question_id', '')::UUID,
    p_decision->>'selected_resolution',
    p_decision->>'rationale',
    p_decision->>'resolved_by',
    p_decision->>'answer_source',
    NULLIF(p_decision->>'selected_recommendation_index', '')::INTEGER,
    NULLIF(p_decision->>'selected_recommendation_value', ''),
    NULLIF(p_decision->>'supersedes_decision_id', '')::UUID,
    COALESCE(NULLIF(p_decision->>'decided_at', '')::TIMESTAMPTZ, now())
  )
  RETURNING * INTO v_decision;
  RETURN to_jsonb(v_decision);
END;
$$;

-- Keep automatic clarifying answers distinguishable from user selections.
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
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
     ) THEN
    RAISE EXCEPTION 'Clarifying question access denied' USING ERRCODE = '42501';
  END IF;

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
        answer_source = 'system',
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
      'error', 'Automatic answer transaction failed',
      'code', SQLSTATE,
      'updated_count', 0,
      'total_pending', v_total_count
    );
END;
$$;

ALTER TABLE public.document_evidence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_batch_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY runs_tenant_select ON public.document_evidence_runs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_runs.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY items_tenant_select ON public.document_evidence_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_items.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY batch_checkpoints_tenant_select ON public.document_evidence_batch_checkpoints
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_batch_checkpoints.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY conflicts_tenant_select ON public.document_evidence_conflicts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_conflicts.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY decisions_tenant_select ON public.document_evidence_decisions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_decisions.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
GRANT SELECT ON public.document_evidence_runs TO authenticated;
GRANT SELECT ON public.document_evidence_items TO authenticated;
GRANT SELECT ON public.document_evidence_batch_checkpoints TO authenticated;
GRANT SELECT ON public.document_evidence_conflicts TO authenticated;
GRANT SELECT ON public.document_evidence_decisions TO authenticated;

REVOKE ALL ON FUNCTION public.create_or_reuse_document_evidence_run(UUID, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_document_evidence_items(UUID, UUID, UUID, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_document_evidence_run(UUID, UUID, UUID, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkpoint_document_evidence_run_metrics(
  UUID, UUID, UUID, INTEGER, INTEGER, BIGINT, BIGINT, NUMERIC
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_document_evidence_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB,
  INTEGER, INTEGER, BIGINT, BIGINT, NUMERIC
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_document_evidence_conflict(UUID, UUID, UUID, JSONB, TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_document_evidence_decision(JSONB)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_or_reuse_document_evidence_run(UUID, UUID, TEXT, TEXT, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_document_evidence_run(UUID, UUID, UUID, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_document_evidence_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB,
  INTEGER, INTEGER, BIGINT, BIGINT, NUMERIC
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_document_evidence_conflict(UUID, UUID, UUID, JSONB, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_document_evidence_decision(JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_answer_questions_atomic(UUID)
  TO authenticated, service_role;

GRANT ALL ON public.document_evidence_runs TO service_role;
GRANT ALL ON public.document_evidence_items TO service_role;
GRANT ALL ON public.document_evidence_batch_checkpoints TO service_role;
GRANT ALL ON public.document_evidence_conflicts TO service_role;
GRANT ALL ON public.document_evidence_decisions TO service_role;

COMMENT ON TABLE public.document_evidence_conflicts IS
  'Immutable detected document conflicts; direct UPDATE and DELETE are rejected.';
COMMENT ON TABLE public.document_evidence_decisions IS
  'Append-only conflict resolution events; current state is the unsuperseded chain event.';
COMMENT ON FUNCTION public.persist_document_evidence_items(UUID, UUID, UUID, JSONB) IS
  'Atomically persists exactly one evidence item per source document and synchronizes run counts.';
