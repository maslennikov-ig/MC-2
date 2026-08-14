-- Let a referential-action cascade remove conflict checkpoints.
--
-- Every other document-evidence immutability trigger already exempts cascades
-- (`prevent_document_evidence_terminal_run_mutation`,
-- `prevent_document_evidence_terminal_item_mutation`,
-- `reject_document_evidence_mutation` for conflicts, decisions and batch
-- checkpoints). This one was written without the exemption, so deleting a
-- course that reached Stage 4 with DOCUMENT_EVIDENCE_MODE=active failed with
-- 55000 and the user's data could not be removed at all.
--
-- Direct UPDATE and direct DELETE of an audit row stay rejected: the exemption
-- is scoped to DELETE reached through another trigger (pg_trigger_depth() > 1),
-- which is exactly the ON DELETE CASCADE path from courses and runs.

CREATE OR REPLACE FUNCTION public.reject_document_evidence_conflict_checkpoint_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Permit referential-action cascades while rejecting direct row mutation.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Document evidence conflict checkpoints are immutable'
    USING ERRCODE = '55000';
END;
$$;
