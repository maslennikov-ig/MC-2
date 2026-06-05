BEGIN;

ALTER TABLE career_playbooks
  ADD COLUMN IF NOT EXISTS visibility course_visibility NOT NULL DEFAULT 'private'::course_visibility;

UPDATE career_playbooks
SET visibility = CASE WHEN is_public THEN 'public'::course_visibility ELSE 'private'::course_visibility END;

CREATE INDEX IF NOT EXISTS idx_career_playbooks_visibility
  ON career_playbooks(visibility);

CREATE INDEX IF NOT EXISTS idx_career_playbooks_org_visibility_created
  ON career_playbooks(organization_id, visibility, created_at DESC);

CREATE OR REPLACE FUNCTION career_playbooks_sync_is_public_from_visibility()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_public := NEW.visibility = 'public';

  IF NEW.visibility = 'public' AND NEW.share_slug IS NULL THEN
    NEW.share_slug := 'cp-' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS career_playbooks_sync_is_public_from_visibility ON career_playbooks;

CREATE TRIGGER career_playbooks_sync_is_public_from_visibility
  BEFORE INSERT OR UPDATE OF visibility, share_slug, is_public ON career_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION career_playbooks_sync_is_public_from_visibility();

DROP POLICY IF EXISTS career_playbooks_read_own_or_org ON career_playbooks;
DROP POLICY IF EXISTS career_playbooks_read_visibility ON career_playbooks;

CREATE POLICY career_playbooks_read_visibility
  ON career_playbooks
  FOR SELECT
  TO authenticated
  USING (
    is_superadmin((SELECT auth.uid()))
    OR (
      visibility = 'private'
      AND user_id = (SELECT auth.uid())
    )
    OR visibility = 'public'
    OR (
      visibility = 'organization'
      AND (
        user_id = (SELECT auth.uid())
        OR organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE user_id = (SELECT auth.uid())
        )
      )
    )
  );

COMMENT ON COLUMN career_playbooks.visibility IS
  'Canonical Career Playbook visibility: private, organization, or public. is_public is a compatibility mirror for public links.';
COMMENT ON FUNCTION career_playbooks_sync_is_public_from_visibility() IS
  'Keeps legacy is_public/share_slug fields compatible with canonical Career Playbook visibility.';
COMMENT ON POLICY career_playbooks_read_visibility ON career_playbooks IS
  'Authenticated users read own playbooks, organization-visible playbooks in their organization, public playbooks, or all playbooks as superadmin.';

DROP POLICY IF EXISTS career_playbook_sources_read_own_or_org ON career_playbook_sources;
DROP POLICY IF EXISTS career_playbook_sources_read_owner_only ON career_playbook_sources;

CREATE POLICY career_playbook_sources_read_owner_only
  ON career_playbook_sources
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_superadmin((SELECT auth.uid()))
  );

COMMENT ON POLICY career_playbook_sources_read_owner_only ON career_playbook_sources IS
  'Career Playbook business-context sources are owner-only because source text can contain private company context; organization readers see the generated playbook, not raw sources.';

COMMIT;
