BEGIN;

CREATE TABLE career_playbook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES career_playbooks(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'text')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'processing', 'ready', 'failed', 'removed')
  ),
  filename TEXT,
  file_catalog_id UUID REFERENCES file_catalog(id) ON DELETE RESTRICT,
  text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT career_playbook_sources_payload_check CHECK (
    (source_type = 'file' AND file_catalog_id IS NOT NULL)
    OR (source_type = 'text' AND text IS NOT NULL)
  )
);

CREATE INDEX idx_career_playbook_sources_playbook
  ON career_playbook_sources(playbook_id)
  WHERE status <> 'removed';

CREATE INDEX idx_career_playbook_sources_org
  ON career_playbook_sources(organization_id);

CREATE INDEX idx_career_playbook_sources_file_catalog
  ON career_playbook_sources(file_catalog_id)
  WHERE file_catalog_id IS NOT NULL;

CREATE TRIGGER career_playbook_sources_updated_at
  BEFORE UPDATE ON career_playbook_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE career_playbook_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY career_playbook_sources_read_own_or_org
  ON career_playbook_sources
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = (SELECT auth.uid())
    )
    OR is_superadmin((SELECT auth.uid()))
  );

CREATE POLICY career_playbook_sources_insert_own_org
  ON career_playbook_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
    AND EXISTS (
      SELECT 1
      FROM career_playbooks cp
      WHERE cp.id = playbook_id
        AND cp.organization_id = organization_id
        AND (cp.user_id = (SELECT auth.uid()) OR is_superadmin((SELECT auth.uid())))
    )
    AND (
      source_type <> 'file'
      OR EXISTS (
        SELECT 1
        FROM file_catalog fc
        WHERE fc.id = file_catalog_id
          AND fc.organization_id = organization_id
          AND fc.course_id IS NULL
      )
    )
  );

CREATE POLICY career_playbook_sources_update_own_org
  ON career_playbook_sources
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
    AND (
      source_type <> 'file'
      OR EXISTS (
        SELECT 1
        FROM file_catalog fc
        WHERE fc.id = file_catalog_id
          AND fc.organization_id = organization_id
          AND fc.course_id IS NULL
      )
    )
  );

CREATE POLICY career_playbook_sources_delete_own_org
  ON career_playbook_sources
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = (SELECT auth.uid())
      )
      OR is_superadmin((SELECT auth.uid()))
    )
  );

COMMENT ON TABLE career_playbook_sources IS
  'Business context source records for Career Playbook Role Guide generation. Files reuse file_catalog/storage without fake course ownership.';
COMMENT ON COLUMN career_playbook_sources.file_catalog_id IS
  'Uploaded file metadata in file_catalog. For Career Playbook uploads file_catalog.course_id remains NULL.';

COMMIT;
