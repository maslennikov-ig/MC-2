-- Bound the global unresolved-critical evidence reconciliation used by textfile metrics.
-- This migration must be executed statement-by-statement in autocommit mode.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clarifying_pending_critical_evidence_created_at
  ON public.clarifying_questions (created_at)
  WHERE question_category = 'document_conflicts'
    AND question_priority = 'critical'
    AND status = 'pending';

COMMENT ON INDEX public.idx_clarifying_pending_critical_evidence_created_at IS
  'Covers exact count and oldest-first reconciliation for pending critical document conflicts.';
