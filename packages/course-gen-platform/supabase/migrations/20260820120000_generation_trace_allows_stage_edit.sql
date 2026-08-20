-- Let `generation_trace` hold what a user spends after generation.
--
-- Editing a finished course — chat, inline block edits, element CRUD,
-- regeneration of one block — is real money against a real course, and it now
-- writes a trace row with `stage = 'stage_edit'` like every other paid call
-- (mc2-b7olk.5). The live column still carries the pipeline-only check
-- constraint, which rejects that value: the insert is rejected, the trace
-- logger records the failure at error level and returns (it never throws, by
-- design), nothing propagates to the caller, and the edit cost stays at zero
-- with nothing in the table to show for it.
--
-- `stage_edit` rather than a number on purpose: an edit is not a pipeline
-- stage, and stage 0 already means "the stage could not be read".
--
-- One transaction, so the table is never left without a constraint: between a
-- bare DROP and a bare ADD it is unconstrained, and an ADD that fails in a
-- manual psql run leaves it that way.
--
-- `lock_timeout` because ADD CONSTRAINT ... CHECK takes ACCESS EXCLUSIVE. The
-- validating scan is milliseconds (37k rows, and only the `stage` attribute is
-- read — the large text and JSONB columns are TOASTed and never decompressed
-- for it), but while the lock *waits* on any open transaction, every new query
-- against this table queues behind it, and the pipeline writes here
-- continuously. Failing fast and being run again beats blocking the pipeline.
--
-- Deliberately not ADD CONSTRAINT ... NOT VALID plus a separate VALIDATE: that
-- skips a scan which was never the expensive part, and gives up the atomicity
-- this transaction is here for.

BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE generation_trace
DROP CONSTRAINT IF EXISTS generation_trace_stage_check;

ALTER TABLE generation_trace
ADD CONSTRAINT generation_trace_stage_check
CHECK (stage = ANY (ARRAY['stage_1'::text, 'stage_2'::text, 'stage_3'::text, 'stage_4'::text, 'stage_5'::text, 'stage_6'::text, 'stage_7'::text, 'stage_edit'::text]));

COMMIT;
