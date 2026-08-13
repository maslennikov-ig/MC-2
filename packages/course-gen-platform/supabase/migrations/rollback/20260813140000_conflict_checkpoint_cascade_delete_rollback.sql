-- Restore the unconditional rejection on document_evidence_conflict_checkpoints.
-- After this, deleting a course that owns a conflict checkpoint fails with 55000
-- again; that is the defect this rollback reinstates, not a safety property.

CREATE OR REPLACE FUNCTION public.reject_document_evidence_conflict_checkpoint_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Document evidence conflict checkpoints are immutable'
    USING ERRCODE = '55000';
END;
$$;
