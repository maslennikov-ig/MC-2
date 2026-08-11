import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260523073000_update_career_playbook_v4_pro_routing.sql'
);
const departmentClassifierMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260528193000_add_career_playbook_department_classifier.sql'
);
const judgeFlashPromotionMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260704150000_promote_career_playbook_judge_flash.sql'
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

  it('adds a classifier phase with fast primary and pro fallback routing', () => {
    const sql = readFileSync(departmentClassifierMigrationPath, 'utf8');

    expect(sql).toContain('stage_career_playbook_department_classifier');
    expect(sql).toContain("'deepseek/deepseek-v4-flash'");
    expect(sql).toContain("'deepseek/deepseek-v4-pro'");
    expect(sql).toContain('max_retries');
  });

  it('promotes the judge to flash primary with pro fallback and leaves the regenerator alone', () => {
    const sql = readFileSync(judgeFlashPromotionMigrationPath, 'utf8');
    const rows = extractCareerPlaybookRows(sql);

    // Fallback MUST stay pro: the size-gated fallback-first routing
    // (CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD) sends large-context
    // judge calls to fallback_model_id, which has to be the stronger model.
    expect(Object.fromEntries(rows)).toEqual({
      stage_career_playbook_judge: {
        model: 'deepseek/deepseek-v4-flash',
        fallback: 'deepseek/deepseek-v4-pro',
      },
    });
    expect(sql).not.toContain('stage_career_playbook_regenerator');
  });
});

/**
 * Quality v2 routing: the spec output budget and the phase timeouts.
 *
 * Both values are measured rather than chosen. The 8000-token spec budget
 * truncated the RoleProfileSpec JSON (the model returned exactly 8000 output
 * tokens), and the 300s timeout turned each stuck call into a 15-20 minute
 * stall — together a third of the 56-minute run of 2026-08-11.
 */
const qualityV2MigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260811120000_career_playbook_quality_v2_routing.sql'
);

describe('career playbook quality v2 routing migration', () => {
  const sql = readFileSync(qualityV2MigrationPath, 'utf8');

  it('raises the spec output budget to 16000 tokens', () => {
    expect(sql).toContain("('stage_career_playbook_spec', 16000, 120000)");
  });

  it('lowers every career playbook phase timeout to 120000 ms', () => {
    for (const phase of Object.keys(EXPECTED_ROUTING)) {
      expect(sql).toMatch(new RegExp(`\\('${phase}', \\d+, 120000\\)`));
    }

    // Scoped to the executable rows: the header comment names the old 300000
    // value on purpose, to record what changed and why.
    const statements = sql.replace(/^--.*$/gm, '');
    expect(statements).not.toContain('300000');
  });

  it('converges only the fields it owns so later routing decisions survive a re-run', () => {
    const updateClause = sql.slice(sql.lastIndexOf('UPDATE public.llm_model_config'));

    expect(updateClause).toContain('max_tokens = desired.max_tokens');
    expect(updateClause).toContain('timeout_ms = desired.timeout_ms');
    expect(updateClause).not.toContain('model_id = desired.model_id');
  });

  it('stays idempotent by inserting only when the active global row is missing', () => {
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain("existing.config_type = 'global'");
  });
});
