import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const visibilityMigrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260605150000_career_playbook_visibility.sql'
);

function visibilityMigrationSql(): string {
  return readFileSync(visibilityMigrationPath, 'utf8');
}

describe('career playbook visibility migration', () => {
  it('adds course-style visibility with owner-only management compatibility', () => {
    const sql = visibilityMigrationSql();

    expect(sql).toContain('ALTER TABLE career_playbooks');
    expect(sql).toContain(
      "visibility course_visibility NOT NULL DEFAULT 'private'::course_visibility"
    );
    expect(sql).toContain("CASE WHEN is_public THEN 'public'::course_visibility");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_career_playbooks_visibility');
    expect(sql).toContain('idx_career_playbooks_org_visibility_created');
    expect(sql).toContain('career_playbooks_read_visibility');
    expect(sql).toContain("visibility = 'private'");
    expect(sql).toContain("visibility = 'organization'");
    expect(sql).toContain("visibility = 'public'");
    expect(sql).toContain('career_playbooks_sync_is_public_from_visibility');
    expect(sql).toContain("NEW.is_public := NEW.visibility = 'public'");
    expect(sql).toContain('DROP POLICY IF EXISTS career_playbook_sources_read_own_or_org');
    expect(sql).toContain('career_playbook_sources_read_owner_only');
    expect(sql).toContain('Career Playbook business-context sources are owner-only');
  });
});
