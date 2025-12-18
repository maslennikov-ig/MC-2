-- Migration: Create config_backups table
-- Purpose: Store configuration snapshots for backup/restore functionality
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/data-model.md

-- ============================================================================
-- Table: config_backups
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  backup_name text NOT NULL,
  backup_type text NOT NULL CHECK (backup_type IN ('manual', 'auto_pre_import', 'scheduled')),
  description text,

  -- Content
  backup_data jsonb NOT NULL,

  -- Audit
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Index for listing backups in chronological order
CREATE INDEX IF NOT EXISTS idx_config_backups_created_at ON config_backups(created_at DESC);

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================

ALTER TABLE config_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage config_backups" ON config_backups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- ============================================================================
-- Cleanup Trigger (FR-034: Keep only last 20 backups)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM config_backups
  WHERE id IN (
    SELECT id
    FROM config_backups
    ORDER BY created_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_old_backups
  AFTER INSERT ON config_backups
  FOR EACH STATEMENT EXECUTE FUNCTION cleanup_old_backups();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE config_backups IS 'Configuration backups for pipeline admin dashboard. Auto-cleaned to keep last 20.';
COMMENT ON COLUMN config_backups.backup_type IS 'Type: manual (user-initiated), auto_pre_import (before import), scheduled (automated)';
COMMENT ON COLUMN config_backups.backup_data IS 'Full configuration snapshot as JSON (model configs, prompts, settings)';
