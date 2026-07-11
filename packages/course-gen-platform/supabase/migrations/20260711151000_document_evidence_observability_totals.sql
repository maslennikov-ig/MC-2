-- Derived O(1) observability state. The append-only decision rows remain canonical.
CREATE TABLE IF NOT EXISTS public.document_evidence_observability_totals (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  user_decisions BIGINT NOT NULL DEFAULT 0 CHECK (user_decisions >= 0),
  system_decisions BIGINT NOT NULL DEFAULT 0 CHECK (system_decisions >= 0),
  degraded_automatic_decisions BIGINT NOT NULL DEFAULT 0
    CHECK (degraded_automatic_decisions >= 0)
);

INSERT INTO public.document_evidence_observability_totals (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_document_evidence_observability_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.document_evidence_observability_totals
  SET
    user_decisions = user_decisions + CASE WHEN NEW.resolved_by = 'user' THEN 1 ELSE 0 END,
    system_decisions = system_decisions + CASE WHEN NEW.resolved_by = 'system' THEN 1 ELSE 0 END,
    degraded_automatic_decisions = degraded_automatic_decisions + CASE
      WHEN NEW.resolved_by = 'system' AND NEW.subject_kind = 'degraded_evidence' THEN 1
      ELSE 0
    END
  WHERE singleton = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document evidence observability singleton is missing';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS increment_document_evidence_observability_totals
  ON public.document_evidence_decisions;
CREATE TRIGGER increment_document_evidence_observability_totals
  AFTER INSERT ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.increment_document_evidence_observability_totals();

-- Trigger DDL holds the decision table against concurrent writers until commit, so this
-- one-time reconciliation cannot miss an insert between the history snapshot and trigger.
UPDATE public.document_evidence_observability_totals
SET
  user_decisions = (
    SELECT count(*) FROM public.document_evidence_decisions WHERE resolved_by = 'user'
  ),
  system_decisions = (
    SELECT count(*) FROM public.document_evidence_decisions WHERE resolved_by = 'system'
  ),
  degraded_automatic_decisions = (
    SELECT count(*)
    FROM public.document_evidence_decisions
    WHERE resolved_by = 'system' AND subject_kind = 'degraded_evidence'
  )
WHERE singleton = TRUE;

ALTER TABLE public.document_evidence_observability_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_evidence_observability_totals FROM PUBLIC;
GRANT SELECT ON public.document_evidence_observability_totals TO service_role;

COMMENT ON TABLE public.document_evidence_observability_totals IS
  'Trigger-maintained singleton counters derived from append-only document evidence decisions.';
