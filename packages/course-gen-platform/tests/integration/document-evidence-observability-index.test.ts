import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION,
  runDocumentEvidenceObservabilityIndexMigration,
  validateDocumentEvidenceMigrationTarget,
} from '../../scripts/migrations/document-evidence-observability-index';

const forwardPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711150000_document_evidence_observability_index.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql'
);
const totalsForwardPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711151000_document_evidence_observability_totals.sql'
);
const totalsRollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711151000_document_evidence_observability_totals_rollback.sql'
);
const forward = existsSync(forwardPath) ? readFileSync(forwardPath, 'utf8') : '';
const rollback = existsSync(rollbackPath) ? readFileSync(rollbackPath, 'utf8') : '';
const totalsForward = existsSync(totalsForwardPath) ? readFileSync(totalsForwardPath, 'utf8') : '';
const totalsRollback = existsSync(totalsRollbackPath)
  ? readFileSync(totalsRollbackPath, 'utf8')
  : '';
const indexName = 'idx_clarifying_pending_critical_evidence_created_at';

describe('document evidence observability index migration', () => {
  it('covers the exact durable reconciliation predicate ordered by created_at', () => {
    expect(forward).toMatch(new RegExp(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName}`));
    expect(forward).toMatch(/ON public\.clarifying_questions\s*\(created_at\)/u);
    expect(forward).toContain("question_category = 'document_conflicts'");
    expect(forward).toContain("question_priority = 'critical'");
    expect(forward).toContain("status = 'pending'");
    expect(rollback).toContain(`DROP INDEX CONCURRENTLY IF EXISTS public.${indexName}`);
  });

  it('keeps decision counters in an O(1) trigger-maintained singleton', () => {
    expect(totalsForward).toContain('document_evidence_observability_totals');
    expect(totalsForward).toMatch(/AFTER INSERT ON public\.document_evidence_decisions/u);
    expect(totalsForward).toMatch(/resolved_by = 'user'/u);
    expect(totalsForward).toMatch(/resolved_by = 'system'/u);
    expect(totalsForward).toMatch(/subject_kind = 'degraded_evidence'/u);
    expect(totalsForward).toContain('ENABLE ROW LEVEL SECURITY');
    expect(totalsForward).toContain(
      'GRANT SELECT ON public.document_evidence_observability_totals TO service_role'
    );
    expect(totalsRollback).toContain(
      'DROP TABLE IF EXISTS public.document_evidence_observability_totals'
    );
  });

  it('rejects remote targets unless both explicit gates are present', () => {
    const remote = 'postgresql://postgres:secret@db.example.com:5432/postgres';
    expect(() => validateDocumentEvidenceMigrationTarget(remote, 'apply', {})).toThrow(
      /remote.*disabled/iu
    );
    expect(() =>
      validateDocumentEvidenceMigrationTarget(remote, 'apply', { allowRemote: true })
    ).toThrow(/confirmation/iu);
    expect(() =>
      validateDocumentEvidenceMigrationTarget(remote, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION.apply,
      })
    ).not.toThrow();
  });
});

const databaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedDescribe = databaseUrl ? describe.sequential : describe.skip;
let client: Client;

function disposableUrl(value: string): string {
  const parsed = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    !/_test$/u.test(parsed.pathname.replace(/^\//u, ''))
  ) {
    throw new Error('Observability index tests require a loopback disposable _test database');
  }
  return value;
}

async function resetSchema(): Promise<void> {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (
      version text NOT NULL PRIMARY KEY,
      statements text[],
      name text
    );
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END
    $$;
    CREATE TABLE public.clarifying_questions (
      id uuid PRIMARY KEY,
      question_category text,
      question_priority text NOT NULL,
      status text NOT NULL,
      user_answer jsonb,
      answered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.document_evidence_decisions (
      id bigserial PRIMARY KEY,
      resolved_by text NOT NULL,
      subject_kind text NOT NULL
    );
  `);
}

async function indexDefinition(): Promise<string | undefined> {
  const result = await client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
    [indexName]
  );
  return result.rows[0]?.indexdef;
}

appliedDescribe('document evidence observability index applied', () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    client = new Client({ connectionString: disposableUrl(databaseUrl) });
    await client.connect();
  });

  beforeEach(async () => resetSchema());

  afterAll(async () => {
    if (!client) return;
    await resetSchema();
    await client.end();
  });

  it('applies the exact partial index and supports the production oldest query', async () => {
    await runDocumentEvidenceObservabilityIndexMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    const definition = await indexDefinition();
    expect(definition).toContain(`CREATE INDEX ${indexName}`);
    expect(definition).toContain('USING btree (created_at)');
    expect(definition).toContain("question_category = 'document_conflicts'::text");
    expect(definition).toContain("question_priority = 'critical'::text");
    expect(definition).toContain("status = 'pending'::text");

    await client.query(`
      INSERT INTO public.clarifying_questions
        (id, question_category, question_priority, status, created_at)
      VALUES
        ('10000000-0000-4000-8000-000000000001','document_conflicts','critical','pending','2026-01-01T00:00:00Z'),
        ('10000000-0000-4000-8000-000000000002','document_conflicts','important','pending','2025-01-01T00:00:00Z');
      SET enable_seqscan=off;
    `);
    const plan = await client.query<{ 'QUERY PLAN': string }>(`
      EXPLAIN (COSTS OFF)
      SELECT created_at
      FROM public.clarifying_questions
      WHERE question_category='document_conflicts'
        AND question_priority='critical'
        AND status='pending'
      ORDER BY created_at ASC
      LIMIT 1
    `);
    expect(plan.rows.map(row => row['QUERY PLAN']).join('\n')).toContain(indexName);
    const history = await client.query<{
      version: string;
      name: string;
      statements: string[];
    }>(`
      SELECT version,name,statements
      FROM supabase_migrations.schema_migrations
      WHERE version='20260711150000'
    `);
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0].name).toBe('document_evidence_observability_index');
    expect(history.rows[0].statements).toHaveLength(2);
  });

  it('rolls back cleanly and reapplies idempotently', async () => {
    const options = { databaseUrl: disposableUrl(databaseUrl!), direction: 'apply' as const };
    await runDocumentEvidenceObservabilityIndexMigration(options);
    await runDocumentEvidenceObservabilityIndexMigration(options);
    await runDocumentEvidenceObservabilityIndexMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'rollback',
    });
    expect(await indexDefinition()).toBeUndefined();
    expect(
      (
        await client.query(
          "SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260711150000'"
        )
      ).rows
    ).toHaveLength(0);
    await runDocumentEvidenceObservabilityIndexMigration(options);
    await runDocumentEvidenceObservabilityIndexMigration(options);
    expect(await indexDefinition()).toContain(indexName);
  });

  it('recovers an exact index created before migration history was recorded', async () => {
    await client.query(forward.split(';')[0]);
    await runDocumentEvidenceObservabilityIndexMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    expect(await indexDefinition()).toContain(indexName);
    expect(
      (
        await client.query(
          "SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260711150000'"
        )
      ).rows
    ).toHaveLength(1);
  });

  it('removes an invalid concurrent-build residue before recreating the index', async () => {
    const blocker = new Client({ connectionString: disposableUrl(databaseUrl!) });
    const failedBuilder = new Client({ connectionString: disposableUrl(databaseUrl!) });
    await Promise.all([blocker.connect(), failedBuilder.connect()]);
    try {
      await blocker.query('BEGIN');
      await blocker.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000020','document_conflicts','critical','pending')
      `);
      const pid = (await failedBuilder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0].pid;
      const creating = failedBuilder.query(forward.split(';')[0]);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await indexDefinition()) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await client.query('SELECT pg_cancel_backend($1)', [pid]);
      await expect(creating).rejects.toMatchObject({ code: '57014' });
      await blocker.query('ROLLBACK');
      const residue = await client.query<{ indisvalid: boolean }>(
        `SELECT indisvalid FROM pg_index WHERE indexrelid=$1::regclass`,
        [`public.${indexName}`]
      );
      expect(residue.rows[0]?.indisvalid).toBe(false);

      await runDocumentEvidenceObservabilityIndexMigration({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      });
      const recovered = await client.query<{ indisvalid: boolean }>(
        `SELECT indisvalid FROM pg_index WHERE indexrelid=$1::regclass`,
        [`public.${indexName}`]
      );
      expect(recovered.rows[0]?.indisvalid).toBe(true);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await Promise.all([blocker.end(), failedBuilder.end()]);
    }
  });

  it('rejects matching history when the live index is missing', async () => {
    await runDocumentEvidenceObservabilityIndexMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(`DROP INDEX CONCURRENTLY public.${indexName}`);
    await expect(
      runDocumentEvidenceObservabilityIndexMigration({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/history.*index/iu);
  });

  it('rejects a transaction-wrapped runner and allows writes during concurrent create/drop', async () => {
    await client.query('BEGIN');
    await expect(client.query(forward)).rejects.toMatchObject({ code: '25001' });
    await client.query('ROLLBACK');

    const blocker = new Client({ connectionString: disposableUrl(databaseUrl!) });
    const writer = new Client({ connectionString: disposableUrl(databaseUrl!) });
    await Promise.all([blocker.connect(), writer.connect()]);
    try {
      await client.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000010','document_conflicts','critical','pending')
      `);
      await blocker.query('BEGIN');
      await blocker.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000011','document_conflicts','critical','pending')
      `);
      const creating = runDocumentEvidenceObservabilityIndexMigration({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      await writer.query("SET statement_timeout = '1s'");
      await writer.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000012','document_conflicts','critical','pending')
      `);
      await writer.query(`
        UPDATE public.clarifying_questions
        SET status='answered', user_answer='{"selected":"continue"}'::jsonb, answered_at=now()
        WHERE id='10000000-0000-4000-8000-000000000010'
      `);
      await blocker.query('COMMIT');
      await creating;

      await blocker.query('BEGIN');
      await blocker.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000013','document_conflicts','critical','pending')
      `);
      const dropping = runDocumentEvidenceObservabilityIndexMigration({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await writer.query(`
        INSERT INTO public.clarifying_questions
          (id, question_category, question_priority, status)
        VALUES ('10000000-0000-4000-8000-000000000014','document_conflicts','critical','pending')
      `);
      await blocker.query('COMMIT');
      await dropping;
      expect(await indexDefinition()).toBeUndefined();
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await Promise.all([blocker.end(), writer.end()]);
    }
  });

  it('seeds, increments, rolls back, and reapplies exact decision totals', async () => {
    await client.query(`
      INSERT INTO public.document_evidence_decisions (resolved_by, subject_kind)
      VALUES
        ('user', 'claim_conflict'),
        ('system', 'claim_conflict'),
        ('system', 'degraded_evidence')
    `);
    await client.query(totalsForward);

    const readTotals = async () =>
      (
        await client.query<{
          user_decisions: string;
          system_decisions: string;
          degraded_automatic_decisions: string;
        }>(`
          SELECT user_decisions, system_decisions, degraded_automatic_decisions
          FROM public.document_evidence_observability_totals
          WHERE singleton=TRUE
        `)
      ).rows[0];

    expect(await readTotals()).toEqual({
      user_decisions: '1',
      system_decisions: '2',
      degraded_automatic_decisions: '1',
    });
    await client.query(`
      INSERT INTO public.document_evidence_decisions (resolved_by, subject_kind)
      VALUES ('user', 'degraded_evidence'), ('system', 'degraded_evidence')
    `);
    expect(await readTotals()).toEqual({
      user_decisions: '2',
      system_decisions: '3',
      degraded_automatic_decisions: '2',
    });

    await client.query(totalsForward);
    expect(await readTotals()).toEqual({
      user_decisions: '2',
      system_decisions: '3',
      degraded_automatic_decisions: '2',
    });
    await client.query(totalsRollback);
    await client.query(totalsForward);
    expect(await readTotals()).toEqual({
      user_decisions: '2',
      system_decisions: '3',
      degraded_automatic_decisions: '2',
    });
  });
});
