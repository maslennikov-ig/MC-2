import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260523073000_update_career_playbook_v4_pro_routing.sql'
);

const EXPECTED_ROUTING = {
  stage_career_playbook_followup: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_spec: {
    model: 'deepseek/deepseek-v4-pro',
    fallback: 'deepseek/deepseek-v4-flash',
  },
  stage_career_playbook_group_1: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_group_2: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_group_3: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_group_4: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_group_5: {
    model: 'deepseek/deepseek-v4-pro',
    fallback: 'deepseek/deepseek-v4-flash',
  },
  stage_career_playbook_group_6: {
    model: 'deepseek/deepseek-v4-flash',
    fallback: 'deepseek/deepseek-v4-pro',
  },
  stage_career_playbook_judge: {
    model: 'deepseek/deepseek-v4-pro',
    fallback: 'deepseek/deepseek-v4-flash',
  },
  stage_career_playbook_regenerator: {
    model: 'deepseek/deepseek-v4-pro',
    fallback: 'deepseek/deepseek-v4-flash',
  },
} as const;

function migrationSql() {
  return readFileSync(migrationPath, 'utf8');
}

function extractCareerPlaybookRows(sql: string) {
  const rows = new Map<string, { model: string; fallback: string }>();
  const rowPattern =
    /\('(?<phase>stage_career_playbook_[^']+)',\s*'(?<model>[^']+)',\s*'(?<fallback>[^']+)',/g;

  for (const match of sql.matchAll(rowPattern)) {
    if (!match.groups) continue;
    rows.set(match.groups.phase, {
      model: match.groups.model,
      fallback: match.groups.fallback,
    });
  }

  return rows;
}

describe('Career Playbook DeepSeek V4 Pro routing migration', () => {
  it('routes complex Career Playbook phases to V4 Pro and keeps MiniMax out of the chain', () => {
    const sql = migrationSql();
    const rows = extractCareerPlaybookRows(sql);

    expect(sql).not.toContain('minimax/');
    expect(Object.fromEntries(rows)).toEqual(EXPECTED_ROUTING);
  });
});
