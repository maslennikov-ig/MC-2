-- ============================================================================
-- Migration: recompute organizations.storage_used_bytes from file_catalog
-- Issue:     mc2-mg8un
-- ============================================================================
--
-- The counter was never maintained. `update_organization_storage` lived in
-- 20251015_add_storage_quota_functions.sql, which was never applied, so every
-- call failed and the fallback in shared/qdrant/lifecycle.ts wrote only
-- `updated_at`. Ten months later: 74 of 75 organizations at exactly 0 against
-- 243 MB of real files, and one organization at 387 MB — larger than the entire
-- catalogue, left over from some earlier era.
--
-- The function is applied now and the fallback throws instead of pretending, so
-- from here the counter tracks. This fixes the starting point.
--
-- WHAT THE COUNTER COUNTS was not a matter of opinion; the call sites decide it:
--
--   lifecycle.ts:438        increment by fileBuffer.length   (new unique file)
--   lifecycle-helpers.ts:131 increment by fileBuffer.length  (deduplicated copy,
--                            commented "BOTH organizations pay for their reference")
--   lifecycle.ts:526        decrement by fileRecord.file_size (on delete)
--
-- So it is the sum of `file_size` over the organization's `file_catalog` rows —
-- billed per reference, not per distinct blob on disk. `file_catalog` has no
-- soft-delete column and deletes are hard, so the sum over current rows is the
-- whole truth. No row has a NULL file_size.
--
-- Measured before writing: exactly three rows change.
--   Default Organization          387372913 -> 254569341
--   Test Org TRIAL 1773764280116          0 ->      8768
--   Test Org TRIAL 1773859639403          0 ->      8768
-- The other 72 organizations already hold 0 and compute 0.
--
-- Prior values are kept so the rollback is a real rollback and not a guess.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS organization_storage_backfill_backup (
  organization_id UUID PRIMARY KEY,
  storage_used_bytes BIGINT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- `ON CONFLICT DO NOTHING`, not a plain INSERT: a second run must not overwrite
-- the ORIGINAL values with the already-corrected ones, which would quietly turn
-- the rollback into a no-op.
INSERT INTO organization_storage_backfill_backup (organization_id, storage_used_bytes)
SELECT id, storage_used_bytes FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

UPDATE organizations o
SET storage_used_bytes = COALESCE(
      (SELECT SUM(fc.file_size) FROM file_catalog fc WHERE fc.organization_id = o.id),
      0
    ),
    updated_at = NOW()
WHERE o.storage_used_bytes IS DISTINCT FROM COALESCE(
      (SELECT SUM(fc.file_size) FROM file_catalog fc WHERE fc.organization_id = o.id),
      0
    );

DO $$
DECLARE
  v_wrong INTEGER;
BEGIN
  SELECT count(*) INTO v_wrong
  FROM organizations o
  WHERE o.storage_used_bytes IS DISTINCT FROM COALESCE(
    (SELECT SUM(fc.file_size) FROM file_catalog fc WHERE fc.organization_id = o.id), 0
  );

  IF v_wrong <> 0 THEN
    RAISE EXCEPTION 'storage_used_bytes still disagrees with file_catalog for % organization(s)', v_wrong;
  END IF;
END;
$$;

COMMIT;
