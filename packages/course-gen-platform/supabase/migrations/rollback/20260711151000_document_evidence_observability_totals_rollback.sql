DROP TRIGGER IF EXISTS increment_document_evidence_observability_totals
  ON public.document_evidence_decisions;
DROP FUNCTION IF EXISTS public.increment_document_evidence_observability_totals();
DROP TABLE IF EXISTS public.document_evidence_observability_totals;
