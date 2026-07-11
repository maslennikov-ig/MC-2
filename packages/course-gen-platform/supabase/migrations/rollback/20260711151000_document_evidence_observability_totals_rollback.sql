DROP TRIGGER IF EXISTS increment_document_evidence_terminal_totals
  ON public.document_evidence_runs;
DROP TRIGGER IF EXISTS increment_document_evidence_checkpoint_totals
  ON public.document_evidence_conflict_checkpoints;
DROP TRIGGER IF EXISTS increment_document_evidence_conflict_totals
  ON public.document_evidence_conflicts;
DROP TRIGGER IF EXISTS increment_document_evidence_observability_totals
  ON public.document_evidence_decisions;

DROP FUNCTION IF EXISTS public.increment_document_evidence_terminal_totals();
DROP FUNCTION IF EXISTS public.increment_document_evidence_checkpoint_totals();
DROP FUNCTION IF EXISTS public.increment_document_evidence_conflict_totals();
DROP FUNCTION IF EXISTS public.increment_document_evidence_observability_totals();
DROP TABLE IF EXISTS public.document_evidence_observability_totals;
