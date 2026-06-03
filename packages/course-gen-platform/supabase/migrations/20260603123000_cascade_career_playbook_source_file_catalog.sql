BEGIN;

ALTER TABLE career_playbook_sources
  DROP CONSTRAINT IF EXISTS career_playbook_sources_file_catalog_id_fkey;

ALTER TABLE career_playbook_sources
  ADD CONSTRAINT career_playbook_sources_file_catalog_id_fkey
  FOREIGN KEY (file_catalog_id)
  REFERENCES file_catalog(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT career_playbook_sources_file_catalog_id_fkey ON career_playbook_sources IS
  'Career Playbook source rows are removed when their file_catalog metadata is deleted during explicit source lifecycle cleanup.';

COMMIT;
