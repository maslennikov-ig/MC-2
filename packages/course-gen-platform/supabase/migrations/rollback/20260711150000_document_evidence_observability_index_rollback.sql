-- This rollback must be executed statement-by-statement in autocommit mode.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_clarifying_pending_critical_evidence_created_at;
