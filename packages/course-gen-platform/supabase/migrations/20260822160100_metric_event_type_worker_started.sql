-- ============================================================================
-- A worker that starts can finally say so
-- Purpose: metric_event_type gains worker_started
-- Date: 2026-08-22
-- Related: mc2-r7udy
-- ============================================================================
--
-- `mc2-r7udy` asks a narrow question: for a given course and time window, can an
-- operator tell from the database alone whether a worker restarted during
-- generation? Today they cannot, and every stuck-Stage-6 investigation has had
-- to guess.
--
-- It has been blocked since 2026-02-18 on exactly this: `metric_event_type` is a
-- PostgreSQL enum with eight values — job_rollback, orphaned_job_recovery,
-- concurrency_limit_hit, worker_timeout, rpc_retry_exhausted,
-- duplicate_job_detected, llm_phase_execution, json_repair_execution — and none
-- of them truthfully means "a worker process started". Reusing one would corrupt
-- the monitoring semantics of whichever was borrowed.
--
-- Worth recording that the plan this work follows stated a migration was not
-- needed here, on the grounds that `system_metrics` carries no CHECK constraint.
-- That is true and beside the point: the constraint is an enum, which is
-- stricter. Checked against the live server rather than the migrations
-- directory, which is the only way this class of thing is ever visible.
--
-- Additive and idempotent, same shape as 20251117102056. Transaction-safe on
-- PostgreSQL 12+; this server is 17.6.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'worker_started'
    AND enumtypid = 'metric_event_type'::regtype
  ) THEN
    ALTER TYPE metric_event_type ADD VALUE 'worker_started';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
DECLARE
  enum_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO enum_count
  FROM pg_enum
  WHERE enumtypid = 'metric_event_type'::regtype;

  IF enum_count <> 9 THEN
    RAISE EXCEPTION 'Expected 9 metric event types, found %', enum_count;
  END IF;

  RAISE NOTICE 'metric_event_type now carries % values', enum_count;
END $$;
