-- ============================================================================
-- Rollback: 20260820170000_backfill_organization_storage_used
-- ============================================================================
--
-- Restores each organization's `storage_used_bytes` to the value captured before
-- the backfill. Only rows the backup actually holds are touched, so an
-- organization created after the backfill keeps whatever it has.
--
-- The backup table is left in place. Dropping it would make a second rollback
-- silently do nothing, and it costs one row per organization.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

UPDATE organizations o
SET storage_used_bytes = b.storage_used_bytes,
    updated_at = NOW()
FROM organization_storage_backfill_backup b
WHERE b.organization_id = o.id
  AND o.storage_used_bytes IS DISTINCT FROM b.storage_used_bytes;

COMMIT;
