import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711140000_document_conflict_side_identity.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711140000_document_conflict_side_identity_rollback.sql'
);
const repositoryPath = resolve(process.cwd(), 'src/stages/stage4-analysis/evidence/repository.ts');

describe('document conflict durable side identity migration', () => {
  it('adds versioned side identity without rewriting the accepted E3 migration', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toMatch(/document-conflict-side-v1/i);
    expect(source).toMatch(/selected_side_handle TEXT/i);
    expect(source).toMatch(/side_handle/is);
    expect(source).toMatch(/side_role/is);
    expect(source).toMatch(/alternative_index/is);
    expect(source).toMatch(/validate_document_evidence_conflict_side_identity/i);
    expect(source).toMatch(/claim_ids/is);
    expect(source).toMatch(/digest|document_evidence_sha256/i);
  });

  it('requires durable handles for new system/suggested/modified claim decisions', () => {
    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toMatch(/answer_source.*system.*suggested.*modified/is);
    expect(source).toMatch(/selected_side_handle IS NOT NULL/is);
    expect(source).toMatch(/answer_source.*custom.*selected_side_handle IS NULL/is);
    expect(source).toMatch(/resolve_document_evidence_question_atomic/is);
    expect(source).toMatch(/answer_document_evidence_question_atomic/is);
  });

  it('backfills only unambiguous legacy identity and provides a reversible wrapper rollback', () => {
    expect(existsSync(rollbackPath)).toBe(true);
    const source = readFileSync(migrationPath, 'utf8');
    const rollback = readFileSync(rollbackPath, 'utf8');
    expect(source).toMatch(/count\(distinct.*side_handle|count\(\*\).*1/is);
    expect(source).toMatch(/selected_side_handle/is);
    expect(source).not.toMatch(/selected_resolution\s*=\s*side->>'statement'/is);
    expect(rollback).toMatch(/DROP CONSTRAINT.*side_handle/is);
    expect(rollback).toMatch(/DROP COLUMN.*selected_side_handle/is);
    expect(rollback).toMatch(
      /CREATE OR REPLACE FUNCTION public\.resolve_document_evidence_question_atomic/is
    );
    expect(rollback).toMatch(
      /CREATE OR REPLACE FUNCTION public\.answer_document_evidence_question_atomic/is
    );
  });

  it('removes the unaudited legacy decision writer from the repository surface', () => {
    const repository = readFileSync(repositoryPath, 'utf8');
    expect(repository).not.toMatch(/appendDecision|AppendEvidenceDecisionInput/);
    expect(repository).not.toMatch(/append_document_evidence_decision/);
  });
});
