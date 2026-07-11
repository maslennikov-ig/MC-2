import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711120000_document_evidence.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql'
);

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8');
}

function rollbackSql(): string {
  return readFileSync(rollbackPath, 'utf8');
}

describe('document evidence migration isolation contract', () => {
  it('creates all tenant-scoped evidence tables and exact uniqueness constraints', () => {
    const sql = migrationSql();

    for (const table of [
      'document_evidence_runs',
      'document_evidence_items',
      'document_evidence_conflicts',
      'document_evidence_decisions',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, 'i'));
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i')
      );
    }

    expect(sql).toMatch(/UNIQUE\s*\(run_id,\s*document_id\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(run_id,\s*conflict_fingerprint\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(course_id,\s*input_fingerprint,\s*evidence_version\)/i);
  });

  it('denies cross-tenant authenticated access through course organization ownership', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/TO authenticated/i);
    expect(sql).toMatch(/FROM public\.courses/i);
    expect(sql).toMatch(
      /courses\.organization_id\s*=\s*\(\(SELECT auth\.jwt\(\)\)->>'organization_id'\)::uuid/i
    );
    expect(sql.match(/CREATE POLICY\s+\w+_tenant_select/gi)).toHaveLength(4);
    expect(sql.match(/CREATE POLICY\s+\w+_tenant_insert/gi)).toHaveLength(4);
    expect(sql).not.toMatch(/TO authenticated[\s\S]{0,120}USING\s*\(true\)/i);
  });

  it('grants backend service access without exposing JSON bodies in logging SQL', () => {
    const sql = migrationSql();

    for (const table of [
      'document_evidence_runs',
      'document_evidence_items',
      'document_evidence_conflicts',
      'document_evidence_decisions',
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT ALL ON public\\.${table} TO service_role`, 'i'));
    }
    expect(sql).not.toMatch(
      /RAISE\s+(NOTICE|LOG|WARNING)[^;]*(claims|sides|summary|rationale|selected_resolution)/i
    );
  });

  it('enforces immutable conflicts and append-only decision rows at the database boundary', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE TRIGGER prevent_document_evidence_conflicts_mutation/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.document_evidence_conflicts/i);
    expect(sql).toMatch(/CREATE TRIGGER prevent_document_evidence_decisions_mutation/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.document_evidence_decisions/i);
    expect(sql).toMatch(/supersedes_decision_id UUID/i);
    expect(sql).toMatch(/UNIQUE\s*\(supersedes_decision_id\)/i);
  });

  it('persists automatic clarifying answers as system answers', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auto_answer_questions_atomic/i);
    expect(sql).toMatch(/answer_source\s*=\s*'system'/i);
    expect(sql).toMatch(/EXCEPTION\s+WHEN OTHERS[\s\S]*'success',\s*false/i);
  });

  it('rolls back functions, policies, triggers, and tables in dependency order', () => {
    const sql = rollbackSql();

    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.persist_document_evidence_items/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_decisions/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_conflicts/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_items/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_runs/i);
    expect(sql).toMatch(/answer_source\s*=\s*'suggested'/i);
    expect(sql).toMatch(/EXCEPTION\s+WHEN OTHERS[\s\S]*'success',\s*false/i);
  });
});
