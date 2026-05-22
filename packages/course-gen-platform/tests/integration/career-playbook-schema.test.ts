import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../supabase/migrations/20260513090000_career_playbook.sql'
);

function migrationSql() {
  return readFileSync(migrationPath, 'utf8');
}

describe('Career Playbook migration contract', () => {
  it('creates the required tables, indexes, trigger, and RLS policies', () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE TABLE career_playbooks');
    expect(sql).toContain('CREATE TABLE career_playbook_fixed_questions');
    expect(sql).toContain('CREATE INDEX idx_career_playbooks_user');
    expect(sql).toContain('CREATE INDEX idx_career_playbooks_org');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_career_playbooks_share_slug');
    expect(sql).toContain('CREATE TRIGGER career_playbooks_updated_at');
    expect(sql).toContain('ALTER TABLE career_playbooks ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE career_playbook_fixed_questions ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('TO authenticated');
    expect(sql).toContain('TO anon, authenticated');
  });

  it('constrains playbook statuses and content languages to the Phase 1 contract', () => {
    const sql = migrationSql();

    for (const status of [
      'draft',
      'answering_fixed',
      'awaiting_followups',
      'answering_followups',
      'ready_to_generate',
      'generating',
      'completed',
      'failed',
    ]) {
      expect(sql).toContain(`'${status}'`);
    }

    for (const language of [
      'ru',
      'en',
      'zh',
      'es',
      'fr',
      'de',
      'ja',
      'ko',
      'ar',
      'pt',
      'it',
      'tr',
      'vi',
      'th',
      'id',
      'ms',
      'hi',
      'bn',
      'pl',
    ]) {
      expect(sql).toContain(`'${language}'`);
    }
  });

  it('seeds exactly seven fixed questions for both Russian and English UI languages', () => {
    const sql = migrationSql();

    const valueRows = sql.match(/\('(?:ru|en)',\s+\d,\s+'[a-z_]+',/g) ?? [];
    expect(valueRows).toHaveLength(14);

    for (const questionKey of [
      'position',
      'department',
      'level',
      'reporting',
      'team_size',
      'company_stage',
      'content_language',
    ]) {
      expect(sql.match(new RegExp(`'${questionKey}'`, 'g')) ?? []).toHaveLength(2);
    }
  });
});
