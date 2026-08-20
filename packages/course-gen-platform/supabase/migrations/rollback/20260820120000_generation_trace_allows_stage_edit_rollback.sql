-- Restore the pipeline-only check on generation_trace.stage.
--
-- After this, any row with `stage = 'stage_edit'` is rejected again. Editing
-- cost silently returns to zero; that is the defect this rollback reinstates,
-- not a safety property.
--
-- The rows have to go before the constraint comes back, or ADD CONSTRAINT
-- fails on the existing data — and those rows are the only record that the
-- money was spent. So they are copied first: dev and staging share one
-- database, this DELETE has no course, date or environment filter, and without
-- the copy it destroys every environment's editing spend at once with nothing
-- to restore from.
--
-- The copy is two statements, and must stay two. `CREATE TABLE IF NOT EXISTS
-- ... AS SELECT` skips the whole statement, SELECT included, when the table is
-- already there — so on a second rollback (rollback, re-apply, more editing,
-- rollback again) the copy would silently do nothing while the DELETE took the
-- new rows with it. That is exactly the loss this step exists to prevent, and
-- it fails quietly. Creating the shape and filling it are therefore separate.
--
-- The backup accumulates across runs: it holds every rollback's rows, not just
-- the last one. It carries no constraint or index on purpose — it is a raw
-- preservation copy, and a copy that can reject a row is worse than no copy.
-- Drop it by hand once the rollback is known to be permanent.
--
-- One transaction, so a failing ADD CONSTRAINT cannot leave the rows deleted
-- and the constraint missing at the same time.

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS generation_trace_stage_edit_backup
  (LIKE generation_trace INCLUDING DEFAULTS);

INSERT INTO generation_trace_stage_edit_backup
SELECT * FROM generation_trace WHERE stage = 'stage_edit';

DELETE FROM generation_trace WHERE stage = 'stage_edit';

ALTER TABLE generation_trace
DROP CONSTRAINT IF EXISTS generation_trace_stage_check;

ALTER TABLE generation_trace
ADD CONSTRAINT generation_trace_stage_check
CHECK (stage = ANY (ARRAY['stage_1'::text, 'stage_2'::text, 'stage_3'::text, 'stage_4'::text, 'stage_5'::text, 'stage_6'::text, 'stage_7'::text]));

COMMIT;
