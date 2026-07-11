-- Trigger-maintained O(1) reconciliation state. Canonical evidence rows remain authoritative.
CREATE TABLE IF NOT EXISTS public.document_evidence_observability_totals (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  generation BIGINT NOT NULL DEFAULT txid_current() CHECK (generation >= 0),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  accepted_runs BIGINT NOT NULL DEFAULT 0 CHECK (accepted_runs >= 0),
  failed_runs BIGINT NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  source_documents BIGINT NOT NULL DEFAULT 0 CHECK (source_documents >= 0),
  assessed_documents BIGINT NOT NULL DEFAULT 0 CHECK (assessed_documents >= 0),
  degraded_documents BIGINT NOT NULL DEFAULT 0 CHECK (degraded_documents >= 0),
  failed_documents BIGINT NOT NULL DEFAULT 0 CHECK (failed_documents >= 0),
  latest_coverage_source BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_source >= 0),
  latest_coverage_assessed BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_assessed >= 0),
  latest_coverage_degraded BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_degraded >= 0),
  latest_coverage_failed BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_failed >= 0),
  latest_coverage_completed_at TIMESTAMPTZ,
  latest_coverage_run_id UUID,
  full_text_documents BIGINT NOT NULL DEFAULT 0 CHECK (full_text_documents >= 0),
  hierarchical_summary_documents BIGINT NOT NULL DEFAULT 0
    CHECK (hierarchical_summary_documents >= 0),
  summary_documents BIGINT NOT NULL DEFAULT 0 CHECK (summary_documents >= 0),
  targeted_retrieval_documents BIGINT NOT NULL DEFAULT 0
    CHECK (targeted_retrieval_documents >= 0),
  metadata_only_documents BIGINT NOT NULL DEFAULT 0 CHECK (metadata_only_documents >= 0),
  batches BIGINT NOT NULL DEFAULT 0 CHECK (batches >= 0),
  model_calls BIGINT NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_cost_usd NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (total_cost_usd >= 0),
  duration_seconds NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  critical_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (critical_conflicts >= 0),
  important_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (important_conflicts >= 0),
  informational_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (informational_conflicts >= 0),
  user_decisions BIGINT NOT NULL DEFAULT 0 CHECK (user_decisions >= 0),
  system_decisions BIGINT NOT NULL DEFAULT 0 CHECK (system_decisions >= 0),
  degraded_automatic_decisions BIGINT NOT NULL DEFAULT 0
    CHECK (degraded_automatic_decisions >= 0)
);

-- Support an idempotent rerun after the earlier decision-only singleton shape.
ALTER TABLE public.document_evidence_observability_totals
  ADD COLUMN IF NOT EXISTS generation BIGINT NOT NULL DEFAULT txid_current() CHECK (generation >= 0),
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN IF NOT EXISTS accepted_runs BIGINT NOT NULL DEFAULT 0 CHECK (accepted_runs >= 0),
  ADD COLUMN IF NOT EXISTS failed_runs BIGINT NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  ADD COLUMN IF NOT EXISTS source_documents BIGINT NOT NULL DEFAULT 0 CHECK (source_documents >= 0),
  ADD COLUMN IF NOT EXISTS assessed_documents BIGINT NOT NULL DEFAULT 0 CHECK (assessed_documents >= 0),
  ADD COLUMN IF NOT EXISTS degraded_documents BIGINT NOT NULL DEFAULT 0 CHECK (degraded_documents >= 0),
  ADD COLUMN IF NOT EXISTS failed_documents BIGINT NOT NULL DEFAULT 0 CHECK (failed_documents >= 0),
  ADD COLUMN IF NOT EXISTS latest_coverage_source BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_source >= 0),
  ADD COLUMN IF NOT EXISTS latest_coverage_assessed BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_assessed >= 0),
  ADD COLUMN IF NOT EXISTS latest_coverage_degraded BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_degraded >= 0),
  ADD COLUMN IF NOT EXISTS latest_coverage_failed BIGINT NOT NULL DEFAULT 0 CHECK (latest_coverage_failed >= 0),
  ADD COLUMN IF NOT EXISTS latest_coverage_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_coverage_run_id UUID,
  ADD COLUMN IF NOT EXISTS full_text_documents BIGINT NOT NULL DEFAULT 0 CHECK (full_text_documents >= 0),
  ADD COLUMN IF NOT EXISTS hierarchical_summary_documents BIGINT NOT NULL DEFAULT 0 CHECK (hierarchical_summary_documents >= 0),
  ADD COLUMN IF NOT EXISTS summary_documents BIGINT NOT NULL DEFAULT 0 CHECK (summary_documents >= 0),
  ADD COLUMN IF NOT EXISTS targeted_retrieval_documents BIGINT NOT NULL DEFAULT 0 CHECK (targeted_retrieval_documents >= 0),
  ADD COLUMN IF NOT EXISTS metadata_only_documents BIGINT NOT NULL DEFAULT 0 CHECK (metadata_only_documents >= 0),
  ADD COLUMN IF NOT EXISTS batches BIGINT NOT NULL DEFAULT 0 CHECK (batches >= 0),
  ADD COLUMN IF NOT EXISTS model_calls BIGINT NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (total_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  ADD COLUMN IF NOT EXISTS critical_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (critical_conflicts >= 0),
  ADD COLUMN IF NOT EXISTS important_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (important_conflicts >= 0),
  ADD COLUMN IF NOT EXISTS informational_conflicts BIGINT NOT NULL DEFAULT 0 CHECK (informational_conflicts >= 0);

INSERT INTO public.document_evidence_observability_totals (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_document_evidence_terminal_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_text BIGINT;
  v_hierarchical BIGINT;
  v_summary BIGINT;
  v_targeted BIGINT;
  v_metadata BIGINT;
BEGIN
  SELECT
    count(*) FILTER (WHERE processing_mode = 'full_text'),
    count(*) FILTER (WHERE processing_mode = 'hierarchical_summary'),
    count(*) FILTER (WHERE processing_mode = 'summary'),
    count(*) FILTER (WHERE processing_mode = 'targeted_retrieval'),
    count(*) FILTER (WHERE processing_mode = 'metadata_only')
  INTO v_full_text, v_hierarchical, v_summary, v_targeted, v_metadata
  FROM public.document_evidence_items
  WHERE run_id = NEW.id;

  UPDATE public.document_evidence_observability_totals
  SET
    revision = revision + 1,
    accepted_runs = accepted_runs + CASE WHEN NEW.status = 'accepted' THEN 1 ELSE 0 END,
    failed_runs = failed_runs + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    source_documents = source_documents + NEW.source_count,
    assessed_documents = assessed_documents + NEW.assessed_count,
    degraded_documents = degraded_documents + NEW.degraded_count,
    failed_documents = failed_documents + NEW.failed_count,
    latest_coverage_source = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.source_count ELSE latest_coverage_source END,
    latest_coverage_assessed = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.assessed_count ELSE latest_coverage_assessed END,
    latest_coverage_degraded = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.degraded_count ELSE latest_coverage_degraded END,
    latest_coverage_failed = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.failed_count ELSE latest_coverage_failed END,
    latest_coverage_completed_at = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.completed_at ELSE latest_coverage_completed_at END,
    latest_coverage_run_id = CASE
      WHEN latest_coverage_completed_at IS NULL
        OR (NEW.completed_at, NEW.id) > (latest_coverage_completed_at, latest_coverage_run_id)
      THEN NEW.id ELSE latest_coverage_run_id END,
    full_text_documents = full_text_documents + v_full_text,
    hierarchical_summary_documents = hierarchical_summary_documents + v_hierarchical,
    summary_documents = summary_documents + v_summary,
    targeted_retrieval_documents = targeted_retrieval_documents + v_targeted,
    metadata_only_documents = metadata_only_documents + v_metadata,
    batches = batches + NEW.batch_count,
    model_calls = model_calls + NEW.model_calls,
    input_tokens = input_tokens + NEW.input_tokens,
    output_tokens = output_tokens + NEW.output_tokens,
    total_cost_usd = total_cost_usd + NEW.total_cost_usd,
    duration_seconds = duration_seconds + GREATEST(
      extract(epoch FROM (NEW.completed_at - NEW.started_at)), 0
    )
  WHERE singleton = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document evidence observability singleton is missing'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_document_evidence_terminal_totals
  ON public.document_evidence_runs;
CREATE TRIGGER increment_document_evidence_terminal_totals
  AFTER UPDATE OF status ON public.document_evidence_runs
  FOR EACH ROW
  WHEN (
    OLD.status NOT IN ('accepted', 'failed')
    AND NEW.status IN ('accepted', 'failed')
  )
  EXECUTE FUNCTION public.increment_document_evidence_terminal_totals();

DROP TRIGGER IF EXISTS increment_document_evidence_terminal_insert_totals
  ON public.document_evidence_runs;
CREATE TRIGGER increment_document_evidence_terminal_insert_totals
  AFTER INSERT ON public.document_evidence_runs
  FOR EACH ROW
  WHEN (NEW.status IN ('accepted', 'failed'))
  EXECUTE FUNCTION public.increment_document_evidence_terminal_totals();

CREATE OR REPLACE FUNCTION public.increment_document_evidence_checkpoint_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT := NEW.structured_checkpoint->>'kind';
  v_usage JSONB := COALESCE(NEW.structured_checkpoint->'usage', '{}'::jsonb);
BEGIN
  IF v_kind NOT IN (
    'conflict_map', 'conflict_reduction', 'conflict_classification',
    'conflict_capacity_degraded'
  ) THEN
    RETURN NEW;
  END IF;
  UPDATE public.document_evidence_observability_totals
  SET
    revision = revision + 1,
    batches = batches + 1,
    model_calls = model_calls + COALESCE((v_usage->>'model_calls')::BIGINT, 0),
    input_tokens = input_tokens + COALESCE((v_usage->>'input_tokens')::BIGINT, 0),
    output_tokens = output_tokens + COALESCE((v_usage->>'output_tokens')::BIGINT, 0),
    total_cost_usd = total_cost_usd + COALESCE((v_usage->>'total_cost_usd')::NUMERIC, 0)
  WHERE singleton = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document evidence observability singleton is missing'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_document_evidence_checkpoint_totals
  ON public.document_evidence_conflict_checkpoints;
CREATE TRIGGER increment_document_evidence_checkpoint_totals
  AFTER INSERT ON public.document_evidence_conflict_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.increment_document_evidence_checkpoint_totals();

CREATE OR REPLACE FUNCTION public.increment_document_evidence_conflict_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.document_evidence_observability_totals
  SET
    revision = revision + 1,
    critical_conflicts = critical_conflicts + CASE WHEN NEW.severity = 'critical' THEN 1 ELSE 0 END,
    important_conflicts = important_conflicts + CASE WHEN NEW.severity = 'important' THEN 1 ELSE 0 END,
    informational_conflicts = informational_conflicts + CASE WHEN NEW.severity = 'informational' THEN 1 ELSE 0 END
  WHERE singleton = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document evidence observability singleton is missing'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_document_evidence_conflict_totals
  ON public.document_evidence_conflicts;
CREATE TRIGGER increment_document_evidence_conflict_totals
  AFTER INSERT ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.increment_document_evidence_conflict_totals();

CREATE OR REPLACE FUNCTION public.increment_document_evidence_observability_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.document_evidence_observability_totals
  SET
    revision = revision + 1,
    user_decisions = user_decisions + CASE WHEN NEW.resolved_by = 'user' THEN 1 ELSE 0 END,
    system_decisions = system_decisions + CASE WHEN NEW.resolved_by = 'system' THEN 1 ELSE 0 END,
    degraded_automatic_decisions = degraded_automatic_decisions + CASE
      WHEN NEW.resolved_by = 'system' AND NEW.subject_kind = 'degraded_evidence' THEN 1
      ELSE 0
    END
  WHERE singleton = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document evidence observability singleton is missing'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_document_evidence_observability_totals
  ON public.document_evidence_decisions;
CREATE TRIGGER increment_document_evidence_observability_totals
  AFTER INSERT ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.increment_document_evidence_observability_totals();

-- Trigger DDL locks all canonical source tables until this transaction commits, so the seed
-- cannot miss a terminal transition, checkpoint, conflict, or decision between snapshot and hook.
UPDATE public.document_evidence_observability_totals
SET
  revision = revision + 1,
  accepted_runs = (SELECT count(*) FROM public.document_evidence_runs WHERE status = 'accepted'),
  failed_runs = (SELECT count(*) FROM public.document_evidence_runs WHERE status = 'failed'),
  source_documents = (SELECT COALESCE(sum(source_count), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')),
  assessed_documents = (SELECT COALESCE(sum(assessed_count), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')),
  degraded_documents = (SELECT COALESCE(sum(degraded_count), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')),
  failed_documents = (SELECT COALESCE(sum(failed_count), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')),
  latest_coverage_source = COALESCE((SELECT source_count FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1), 0),
  latest_coverage_assessed = COALESCE((SELECT assessed_count FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1), 0),
  latest_coverage_degraded = COALESCE((SELECT degraded_count FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1), 0),
  latest_coverage_failed = COALESCE((SELECT failed_count FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1), 0),
  latest_coverage_completed_at = (SELECT completed_at FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1),
  latest_coverage_run_id = (SELECT id FROM public.document_evidence_runs WHERE status IN ('accepted','failed') ORDER BY completed_at DESC,id DESC LIMIT 1),
  full_text_documents = (SELECT count(*) FROM public.document_evidence_items items JOIN public.document_evidence_runs runs ON runs.id=items.run_id WHERE runs.status IN ('accepted','failed') AND items.processing_mode='full_text'),
  hierarchical_summary_documents = (SELECT count(*) FROM public.document_evidence_items items JOIN public.document_evidence_runs runs ON runs.id=items.run_id WHERE runs.status IN ('accepted','failed') AND items.processing_mode='hierarchical_summary'),
  summary_documents = (SELECT count(*) FROM public.document_evidence_items items JOIN public.document_evidence_runs runs ON runs.id=items.run_id WHERE runs.status IN ('accepted','failed') AND items.processing_mode='summary'),
  targeted_retrieval_documents = (SELECT count(*) FROM public.document_evidence_items items JOIN public.document_evidence_runs runs ON runs.id=items.run_id WHERE runs.status IN ('accepted','failed') AND items.processing_mode='targeted_retrieval'),
  metadata_only_documents = (SELECT count(*) FROM public.document_evidence_items items JOIN public.document_evidence_runs runs ON runs.id=items.run_id WHERE runs.status IN ('accepted','failed') AND items.processing_mode='metadata_only'),
  batches =
    (SELECT COALESCE(sum(batch_count), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')) +
    (SELECT count(*) FROM public.document_evidence_conflict_checkpoints WHERE structured_checkpoint->>'kind' IN ('conflict_map','conflict_reduction','conflict_classification','conflict_capacity_degraded')),
  model_calls =
    (SELECT COALESCE(sum(model_calls), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')) +
    (SELECT COALESCE(sum(COALESCE((structured_checkpoint->'usage'->>'model_calls')::BIGINT, 0)), 0) FROM public.document_evidence_conflict_checkpoints WHERE structured_checkpoint->>'kind' IN ('conflict_map','conflict_reduction','conflict_classification','conflict_capacity_degraded')),
  input_tokens =
    (SELECT COALESCE(sum(input_tokens), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')) +
    (SELECT COALESCE(sum(COALESCE((structured_checkpoint->'usage'->>'input_tokens')::BIGINT, 0)), 0) FROM public.document_evidence_conflict_checkpoints WHERE structured_checkpoint->>'kind' IN ('conflict_map','conflict_reduction','conflict_classification','conflict_capacity_degraded')),
  output_tokens =
    (SELECT COALESCE(sum(output_tokens), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')) +
    (SELECT COALESCE(sum(COALESCE((structured_checkpoint->'usage'->>'output_tokens')::BIGINT, 0)), 0) FROM public.document_evidence_conflict_checkpoints WHERE structured_checkpoint->>'kind' IN ('conflict_map','conflict_reduction','conflict_classification','conflict_capacity_degraded')),
  total_cost_usd =
    (SELECT COALESCE(sum(total_cost_usd), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')) +
    (SELECT COALESCE(sum(COALESCE((structured_checkpoint->'usage'->>'total_cost_usd')::NUMERIC, 0)), 0) FROM public.document_evidence_conflict_checkpoints WHERE structured_checkpoint->>'kind' IN ('conflict_map','conflict_reduction','conflict_classification','conflict_capacity_degraded')),
  duration_seconds = (SELECT COALESCE(sum(GREATEST(extract(epoch FROM (completed_at - started_at)), 0)), 0) FROM public.document_evidence_runs WHERE status IN ('accepted', 'failed')),
  critical_conflicts = (SELECT count(*) FROM public.document_evidence_conflicts WHERE severity = 'critical'),
  important_conflicts = (SELECT count(*) FROM public.document_evidence_conflicts WHERE severity = 'important'),
  informational_conflicts = (SELECT count(*) FROM public.document_evidence_conflicts WHERE severity = 'informational'),
  user_decisions = (SELECT count(*) FROM public.document_evidence_decisions WHERE resolved_by = 'user'),
  system_decisions = (SELECT count(*) FROM public.document_evidence_decisions WHERE resolved_by = 'system'),
  degraded_automatic_decisions = (SELECT count(*) FROM public.document_evidence_decisions WHERE resolved_by = 'system' AND subject_kind = 'degraded_evidence')
WHERE singleton = TRUE;

ALTER TABLE public.document_evidence_observability_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_evidence_observability_totals FROM PUBLIC;
GRANT SELECT ON public.document_evidence_observability_totals TO service_role;

CREATE OR REPLACE FUNCTION public.get_document_evidence_observability_totals()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(totals) || jsonb_build_object(
    'database_start_unix_milliseconds',
    floor(extract(epoch FROM pg_postmaster_start_time()) * 1000)::BIGINT
  )
  FROM public.document_evidence_observability_totals AS totals
  WHERE singleton = TRUE
$$;

REVOKE ALL ON FUNCTION public.get_document_evidence_observability_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_evidence_observability_totals() TO service_role;

COMMENT ON TABLE public.document_evidence_observability_totals IS
  'Revisioned trigger-maintained absolute counters for O(1) Stage 4 reconciliation.';
