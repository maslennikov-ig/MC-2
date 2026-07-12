import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711130000_document_conflict_auto_answers.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711130000_document_conflict_auto_answers_rollback.sql'
);

function sql(): string {
  return readFileSync(migrationPath, 'utf8');
}

function rollback(): string {
  return readFileSync(rollbackPath, 'utf8');
}

describe('document conflict automatic decision migration', () => {
  it('adds an accepted-run conflict checkpoint with immutable tenant scope', () => {
    const source = sql();
    expect(source).toMatch(/CREATE TABLE public\.document_evidence_conflict_checkpoints/i);
    expect(source).toMatch(/UNIQUE\s*\(run_id,\s*batch_key\)/i);
    expect(source).toMatch(/status\s*=\s*'accepted'/i);
    expect(source).toMatch(/reject_document_evidence_conflict_checkpoint_mutation/i);
    expect(source).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('models claim conflicts and degraded evidence as real decision subjects', () => {
    const source = sql();
    expect(source).toMatch(/subject_kind.*claim_conflict.*degraded_evidence/is);
    expect(source).toMatch(/subject_key TEXT/i);
    expect(source).toMatch(/document_id UUID/i);
    expect(source).toMatch(/DROP NOT NULL/i);
    expect(source).toMatch(/document_evidence_decisions_subject_shape/i);
    expect(source).not.toMatch(/fake_claim/i);
  });

  it('makes conflict batch commit idempotent and rejects same identity with changed payload', () => {
    const source = sql();
    expect(source).toMatch(/commit_document_evidence_conflict_batch/i);
    expect(source).toMatch(/different input hash/i);
    expect(source).toMatch(/different semantic payload/i);
    expect(source).toMatch(/structured_checkpoint/i);
    expect(source).toMatch(/verification_status/i);
    expect(source).toMatch(/FOR UPDATE/i);
  });

  it('validates every persisted conflict claim, document and source ref against accepted cards', () => {
    const source = sql();
    expect(source).toMatch(/claim.*allowlist/is);
    expect(source).toMatch(/document.*allowlist/is);
    expect(source).toMatch(/source ref.*allowlist/is);
    expect(source).toMatch(/document_evidence_items/i);
  });

  it('restricts system conflict writes to service_role and exposes a forced-user answer RPC', () => {
    const source = sql();
    expect(source).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.upsert_document_evidence_conflict[\s\S]*FROM authenticated/i
    );
    expect(source).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.append_document_evidence_decision[\s\S]*FROM authenticated/i
    );
    expect(source).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.materialize_document_evidence_decision_gate_atomic[\s\S]*TO service_role/i
    );
    expect(source).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.answer_document_evidence_questions_atomic[\s\S]*TO authenticated, service_role/i
    );
    expect(source).toMatch(/'user'/i);
    expect(source).toMatch(/answer_source.*suggested.*modified.*custom/is);
  });

  it('atomically locks the accepted run, question, decision and compact course snapshot', () => {
    const source = sql();
    expect(source).toMatch(/materialize_document_evidence_decision_gate_atomic/i);
    expect(source).toMatch(/p_questions JSONB/i);
    expect(source).toMatch(/exactly one recommended/i);
    expect(source).toMatch(/idempotency_key/i);
    expect(source).toMatch(/payload_hash/i);
    expect(source).toMatch(/answer_source\s*=\s*'system'/i);
    expect(source).toMatch(/resolved_by.*system/is);
    expect(source).toMatch(/current_decision_ids.*analysis_result/is);
    expect(source).toMatch(/accepted_run_id.*coverage/is);
    expect(source).toMatch(/unresolved_informational_conflict_ids/i);
  });

  it('allows only the durable failed source_file_unrecoverable terminal exception', () => {
    const source = sql();
    const gate = source.match(
      /CREATE OR REPLACE FUNCTION public\.materialize_document_evidence_decision_gate_atomic[\s\S]*?\n\$\$;/i
    )?.[0];
    expect(gate).toBeDefined();
    expect(gate).toMatch(/document_evidence_items/i);
    expect(gate).toMatch(/coverage_status\s*=\s*'failed'/i);
    expect(gate).toMatch(/coverage_reason\s*=\s*'source_file_unrecoverable'/i);
    expect(gate).toMatch(
      /jsonb_agg\(COALESCE\(answer->>'value', answer->>'text'\) ORDER BY ordinality\)/i
    );
    expect(gate).toMatch(
      /v_suggested_values IS DISTINCT FROM[\s\S]*continue_limited[\s\S]*remove_document/i
    );
    expect(gate).toMatch(/metadata'->'choices' IS DISTINCT FROM v_suggested_values/i);
    expect(gate).toMatch(/continue_limited/i);
    expect(gate).toMatch(/Automatic degraded decision requires exhausted retry attempts/i);
  });

  it('forces manual origin and appends a user supersede atomically with stale-chain rejection', () => {
    const source = sql();
    expect(source).toMatch(/answer_document_evidence_questions_atomic/i);
    expect(source).toMatch(/p_answers JSONB/i);
    expect(source).toMatch(/resolved_by[^;]*'user'/is);
    expect(source).toMatch(/answer_source.*suggested.*modified.*custom/is);
    expect(source).toMatch(/supersedes_decision_id/is);
    expect(source).toMatch(/stale current decision|current decision changed/i);
    expect(source).toMatch(/question.*run.*subject/is);
    expect(source).toMatch(/FOR UPDATE/i);
  });

  it('keeps ordinary automatic answers separate from document decisions', () => {
    const source = sql();
    expect(source).toMatch(/CREATE OR REPLACE FUNCTION public\.auto_answer_questions_atomic/i);
    expect(source).toMatch(/question_category IS DISTINCT FROM 'document_conflicts'/i);
  });

  it('blocks force/sufficiency approval when a material question lacks a current decision', () => {
    const source = sql();
    expect(source).toMatch(/guard_document_evidence_course_transition/i);
    expect(source).toMatch(/material document evidence subject lacks answered current decision/i);
    expect(source).toMatch(/BEFORE UPDATE OF generation_status ON public\.courses/i);
  });

  it('rolls back every new object and restores prior grants/signatures', () => {
    const source = rollback();
    expect(source).toMatch(/DROP TRIGGER.*guard_document_evidence_course_transition/is);
    expect(source).toMatch(/DROP FUNCTION.*materialize_document_evidence_decision_gate_atomic/is);
    expect(source).toMatch(/DROP FUNCTION.*answer_document_evidence_questions_atomic/is);
    expect(source).toMatch(/DROP FUNCTION.*commit_document_evidence_conflict_batch/is);
    expect(source).toMatch(/DROP TABLE.*document_evidence_conflict_checkpoints/is);
    expect(source).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.upsert_document_evidence_conflict[\s\S]*FROM authenticated, service_role/i
    );
    expect(source).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.append_document_evidence_decision[\s\S]*FROM authenticated, service_role/i
    );
  });
});
