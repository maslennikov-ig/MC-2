import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION,
  DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION,
  runDocumentEvidenceObservabilityMigration,
  runDocumentEvidenceObservabilityIndexMigration,
  validateDocumentEvidenceObservabilityMigrationTarget,
  validateDocumentEvidenceMigrationTarget,
} from '../../scripts/migrations/document-evidence-observability-index';

const execFileAsync = promisify(execFile);

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
    ).toThrow(/sslmode=verify-full/iu);
    expect(() =>
      validateDocumentEvidenceMigrationTarget(`${remote}?sslmode=require`, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION.apply,
      })
    ).toThrow(/sslmode=verify-full/iu);
    expect(() =>
      validateDocumentEvidenceMigrationTarget(`${remote}?sslmode=verify-full`, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION.apply,
      })
    ).not.toThrow();
  });

  it('uses distinct exact remote confirmations for the unified migration', () => {
    expect(DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION).toEqual({
      apply: 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000',
      rollback: 'ROLL BACK REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711151000 20260711150000',
    });
    const remote = 'postgresql://postgres:secret@db.example.com:5432/postgres?sslmode=verify-full';
    expect(() =>
      validateDocumentEvidenceObservabilityMigrationTarget(remote, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION.apply,
      })
    ).toThrow(/confirmation/iu);
    expect(() =>
      validateDocumentEvidenceObservabilityMigrationTarget(remote, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION.apply,
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
    CREATE TABLE public.document_evidence_runs (
      id uuid PRIMARY KEY,
      status text NOT NULL,
      source_count integer NOT NULL DEFAULT 0,
      assessed_count integer NOT NULL DEFAULT 0,
      degraded_count integer NOT NULL DEFAULT 0,
      failed_count integer NOT NULL DEFAULT 0,
      batch_count integer NOT NULL DEFAULT 0,
      model_calls integer NOT NULL DEFAULT 0,
      input_tokens bigint NOT NULL DEFAULT 0,
      output_tokens bigint NOT NULL DEFAULT 0,
      total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE TABLE public.document_evidence_items (
      id uuid PRIMARY KEY,
      run_id uuid NOT NULL,
      processing_mode text NOT NULL,
      coverage_status text NOT NULL CHECK (coverage_status IN ('assessed','degraded','failed'))
    );
    CREATE TABLE public.document_evidence_conflict_checkpoints (
      id uuid PRIMARY KEY,
      structured_checkpoint jsonb NOT NULL
    );
    CREATE TABLE public.document_evidence_conflicts (
      id uuid PRIMARY KEY,
      severity text NOT NULL
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

  it('applies both exact migrations on one target and reuses the verified live state', async () => {
    const options = { databaseUrl: disposableUrl(databaseUrl!), direction: 'apply' as const };
    await expect(runDocumentEvidenceObservabilityMigration(options)).resolves.toBe('applied');
    await expect(runDocumentEvidenceObservabilityMigration(options)).resolves.toBe('reused');

    const history = await client.query<{ version: string; name: string; statements: string[] }>(`
      SELECT version,name,statements
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260711150000','20260711151000')
      ORDER BY version
    `);
    expect(history.rows.map(row => [row.version, row.name])).toEqual([
      ['20260711150000', 'document_evidence_observability_index'],
      ['20260711151000', 'document_evidence_observability_totals'],
    ]);
    expect(history.rows[0].statements).toHaveLength(2);
    expect(history.rows[1].statements.length).toBeGreaterThan(10);

    const live = await client.query<{
      table_name: string | null;
      trigger_count: string;
      rls_enabled: boolean;
      generation: string;
    }>(`
      SELECT
        to_regclass('public.document_evidence_observability_totals')::text AS table_name,
        (SELECT count(*)::text FROM pg_trigger
         WHERE tgname IN (
           'increment_document_evidence_terminal_totals',
           'increment_document_evidence_terminal_insert_totals',
           'increment_document_evidence_checkpoint_totals',
           'increment_document_evidence_conflict_totals',
           'increment_document_evidence_observability_totals'
         ) AND NOT tgisinternal) AS trigger_count,
        (SELECT relrowsecurity FROM pg_class
         WHERE oid='public.document_evidence_observability_totals'::regclass) AS rls_enabled,
        (SELECT generation::text FROM public.document_evidence_observability_totals) AS generation
    `);
    expect(live.rows[0]).toEqual({
      table_name: 'document_evidence_observability_totals',
      trigger_count: '5',
      rls_enabled: true,
      generation: expect.stringMatching(/^\d+$/u),
    });
    const rpc = (
      await client.query<{ value: Record<string, unknown> }>(
        'SELECT public.get_document_evidence_observability_totals() AS value'
      )
    ).rows[0].value;
    expect(Number(rpc.generation)).toBeGreaterThan(0);
    expect(Number(rpc.database_start_unix_milliseconds)).toBeGreaterThan(0);
  });

  it('keeps the totals migration and history atomic, then recovers the partial index apply', async () => {
    await client.query('ALTER TABLE public.document_evidence_decisions DROP COLUMN subject_kind');
    const options = { databaseUrl: disposableUrl(databaseUrl!), direction: 'apply' as const };
    await expect(runDocumentEvidenceObservabilityMigration(options)).rejects.toThrow();

    expect(await indexDefinition()).toContain(indexName);
    expect(
      (
        await client.query(`
          SELECT version FROM supabase_migrations.schema_migrations
          WHERE version IN ('20260711150000','20260711151000') ORDER BY version
        `)
      ).rows
    ).toEqual([{ version: '20260711150000' }]);
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.document_evidence_observability_totals')::text AS relation"
        )
      ).rows[0].relation
    ).toBeNull();

    await client.query(
      "ALTER TABLE public.document_evidence_decisions ADD COLUMN subject_kind text NOT NULL DEFAULT 'claim_conflict'"
    );
    await expect(runDocumentEvidenceObservabilityMigration(options)).resolves.toBe('recovered');
  });

  it('rolls back totals before the concurrent index and reapplies the full pair', async () => {
    const target = disposableUrl(databaseUrl!);
    await runDocumentEvidenceObservabilityMigration({ databaseUrl: target, direction: 'apply' });
    const firstGeneration = Number(
      (
        await client.query<{ generation: string }>(
          'SELECT generation FROM public.document_evidence_observability_totals'
        )
      ).rows[0].generation
    );
    await expect(
      runDocumentEvidenceObservabilityMigration({ databaseUrl: target, direction: 'rollback' })
    ).resolves.toBe('rolled_back');
    expect(await indexDefinition()).toBeUndefined();
    expect(
      (await client.query('SELECT version FROM supabase_migrations.schema_migrations')).rows
    ).toHaveLength(0);
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.document_evidence_observability_totals')::text AS relation"
        )
      ).rows[0].relation
    ).toBeNull();
    await expect(
      runDocumentEvidenceObservabilityMigration({ databaseUrl: target, direction: 'apply' })
    ).resolves.toBe('applied');
    const secondGeneration = Number(
      (
        await client.query<{ generation: string }>(
          'SELECT generation FROM public.document_evidence_observability_totals'
        )
      ).rows[0].generation
    );
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
  });

  it('aborts on mismatched totals history before mutating the index', async () => {
    await client.query(`
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
      VALUES ('20260711151000','wrong_totals',ARRAY['SELECT 1'])
    `);
    await expect(
      runDocumentEvidenceObservabilityMigration({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/history.*fixed migration/iu);
    expect(await indexDefinition()).toBeUndefined();
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.document_evidence_observability_totals')::text AS relation"
        )
      ).rows[0].relation
    ).toBeNull();
  });

  it('runs the exact unified package apply and rollback with WSL Windows temp variables', async () => {
    const { TMPDIR: _discarded, ...baseEnv } = process.env;
    const env = {
      ...baseEnv,
      SUPABASE_DB_URL: disposableUrl(databaseUrl!),
      TEMP: '/mnt/c/Users/test/AppData/Local/Temp',
      TMP: '/mnt/c/Users/test/AppData/Local/Temp',
    };
    await execFileAsync(
      'sh',
      ['-lc', 'TMPDIR=${TMPDIR:-/tmp} pnpm run migration:document-evidence-observability:apply'],
      {
        cwd: process.cwd(),
        env,
      }
    );
    expect(await indexDefinition()).toContain(indexName);
    expect(
      (
        await client.query(
          'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
        )
      ).rows
    ).toEqual([{ version: '20260711150000' }, { version: '20260711151000' }]);
    await execFileAsync(
      'sh',
      ['-lc', 'TMPDIR=${TMPDIR:-/tmp} pnpm run migration:document-evidence-observability:rollback'],
      {
        cwd: process.cwd(),
        env,
      }
    );
    expect(
      (await client.query('SELECT version FROM supabase_migrations.schema_migrations')).rows
    ).toHaveLength(0);
    expect(existsSync(resolve(process.cwd(), 'C:\\Users\\test\\AppData\\Local\\Temp'))).toBe(false);
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

  it('reconciles terminal work and conflict checkpoints exactly once in one O(1) row', async () => {
    await client.query(`
      BEGIN;
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,degraded_count,failed_count,
        batch_count,model_calls,input_tokens,output_tokens,total_cost_usd,
        started_at,completed_at
      ) VALUES (
        '20000000-0000-4000-8000-000000000001','accepted',2,1,1,0,
        2,3,100,30,0.5,'2026-01-01T00:00:00Z','2026-01-01T00:00:10Z'
      );
      INSERT INTO public.document_evidence_items(id,run_id,processing_mode,coverage_status) VALUES
        ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','summary','assessed'),
        ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','metadata_only','degraded');
      INSERT INTO public.document_evidence_conflict_checkpoints(id,structured_checkpoint) VALUES (
        '40000000-0000-4000-8000-000000000001',
        '{"kind":"conflict_map","usage":{"model_calls":2,"input_tokens":20,"output_tokens":5,"total_cost_usd":0.1}}'
      );
      INSERT INTO public.document_evidence_conflicts(id,severity) VALUES
        ('50000000-0000-4000-8000-000000000001','critical');
      INSERT INTO public.document_evidence_decisions(resolved_by,subject_kind) VALUES
        ('system','degraded_evidence');
    `);
    await client.query(totalsForward);

    await client.query(`
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,batch_count,model_calls,input_tokens,
        output_tokens,total_cost_usd,started_at
      ) VALUES (
        '20000000-0000-4000-8000-000000000002','processing',1,1,1,1,10,2,0.05,
        '2026-01-01T00:01:00Z'
      );
      INSERT INTO public.document_evidence_items(id,run_id,processing_mode,coverage_status) VALUES
        ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','full_text','assessed');
      UPDATE public.document_evidence_runs
      SET status='accepted',completed_at='2026-01-01T00:01:05Z'
      WHERE id='20000000-0000-4000-8000-000000000002';
      UPDATE public.document_evidence_runs SET status='accepted'
      WHERE id='20000000-0000-4000-8000-000000000002';
      INSERT INTO public.document_evidence_conflict_checkpoints(id,structured_checkpoint) VALUES (
        '40000000-0000-4000-8000-000000000002',
        '{"kind":"conflict_capacity_degraded","issue":{"kind":"detector_capacity"},"usage":{"model_calls":2,"input_tokens":20,"output_tokens":5,"total_cost_usd":0.1}}'
      );
      INSERT INTO public.document_evidence_conflicts(id,severity) VALUES
        ('50000000-0000-4000-8000-000000000002','important');
      INSERT INTO public.document_evidence_decisions(resolved_by,subject_kind) VALUES
        ('user','claim_conflict');
    `);

    const totals = (
      await client.query(`SELECT * FROM public.document_evidence_observability_totals`)
    ).rows[0];
    expect(totals).toMatchObject({
      revision: '5',
      accepted_runs: '2',
      failed_runs: '0',
      source_documents: '3',
      assessed_documents: '2',
      degraded_documents: '1',
      failed_documents: '0',
      full_text_documents: '1',
      summary_documents: '1',
      metadata_only_documents: '1',
      batches: '5',
      model_calls: '8',
      input_tokens: '150',
      output_tokens: '42',
      total_cost_usd: '0.750000',
      duration_seconds: '15.000000',
      critical_conflicts: '1',
      important_conflicts: '1',
      informational_conflicts: '0',
      user_decisions: '1',
      system_decisions: '1',
      degraded_automatic_decisions: '1',
    });
  });

  it('keeps latest coverage ordered by terminal completion instead of trigger arrival', async () => {
    await client.query(totalsForward);
    await client.query(`
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,degraded_count,failed_count,started_at
      ) VALUES
        ('20000000-0000-4000-8000-000000000010','processing',10,10,0,0,'2026-01-01T00:00:00Z'),
        ('20000000-0000-4000-8000-000000000011','processing',4,1,1,2,'2026-01-01T00:00:00Z');
      UPDATE public.document_evidence_runs
      SET status='accepted',completed_at='2026-01-01T00:02:00Z'
      WHERE id='20000000-0000-4000-8000-000000000010';
      UPDATE public.document_evidence_runs
      SET status='failed',completed_at='2026-01-01T00:01:00Z'
      WHERE id='20000000-0000-4000-8000-000000000011';
    `);
    const latest = (
      await client.query(`
        SELECT latest_coverage_source,latest_coverage_assessed,
               latest_coverage_degraded,latest_coverage_failed,
               latest_coverage_completed_at,latest_coverage_run_id
        FROM public.document_evidence_observability_totals
      `)
    ).rows[0];
    expect(latest).toMatchObject({
      latest_coverage_source: '10',
      latest_coverage_assessed: '10',
      latest_coverage_degraded: '0',
      latest_coverage_failed: '0',
      latest_coverage_run_id: '20000000-0000-4000-8000-000000000010',
    });
    expect(new Date(latest.latest_coverage_completed_at).toISOString()).toBe(
      '2026-01-01T00:02:00.000Z'
    );
  });

  it('counts a trusted terminal run inserted directly after trigger installation', async () => {
    await client.query(totalsForward);
    await client.query(`
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,degraded_count,failed_count,batch_count,model_calls,input_tokens,
        output_tokens,total_cost_usd,started_at,completed_at
      ) VALUES (
        '20000000-0000-4000-8000-000000000020','accepted',3,1,1,1,1,1,10,2,0.05,
        '2026-01-01T00:00:00Z','2026-01-01T00:00:05Z'
      );
      INSERT INTO public.document_evidence_items(id,run_id,processing_mode,coverage_status) VALUES
        ('30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','summary','assessed'),
        ('30000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000020','metadata_only','degraded'),
        ('30000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000020','full_text','failed');
      COMMIT;
    `);
    expect(
      (
        await client.query(`
          SELECT accepted_runs,source_documents,assessed_documents,degraded_documents,failed_documents,batches,model_calls,
                 input_tokens,output_tokens,total_cost_usd,duration_seconds,summary_documents
          FROM public.document_evidence_observability_totals
        `)
      ).rows[0]
    ).toMatchObject({
      accepted_runs: '1',
      source_documents: '3',
      assessed_documents: '1',
      degraded_documents: '1',
      failed_documents: '1',
      batches: '1',
      model_calls: '1',
      input_tokens: '10',
      output_tokens: '2',
      total_cost_usd: '0.050000',
      duration_seconds: '5.000000',
      summary_documents: '1',
    });
  });

  it('rejects an accepted terminal insert that commits without its exact durable items', async () => {
    await client.query(totalsForward);
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,started_at,completed_at
      ) VALUES (
        '20000000-0000-4000-8000-000000000021','accepted',1,1,
        '2026-01-01T00:00:00Z','2026-01-01T00:00:05Z'
      )
    `);
    await expect(client.query('COMMIT')).rejects.toThrow(/requires exact durable items/iu);
    await client.query('ROLLBACK').catch(() => undefined);
    expect(
      (
        await client.query(
          "SELECT count(*)::text AS count FROM public.document_evidence_runs WHERE id='20000000-0000-4000-8000-000000000021'"
        )
      ).rows[0].count
    ).toBe('0');
    expect(
      (
        await client.query(
          'SELECT accepted_runs,source_documents FROM public.document_evidence_observability_totals'
        )
      ).rows[0]
    ).toEqual({ accepted_runs: '0', source_documents: '0' });
  });

  it('rejects accepted terminal counts that disagree with durable item coverage statuses', async () => {
    await client.query(totalsForward);
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO public.document_evidence_runs(
        id,status,source_count,assessed_count,degraded_count,failed_count,started_at,completed_at
      ) VALUES (
        '20000000-0000-4000-8000-000000000024','accepted',1,1,0,0,
        '2026-01-01T00:00:00Z','2026-01-01T00:00:05Z'
      );
      INSERT INTO public.document_evidence_items(id,run_id,processing_mode,coverage_status) VALUES (
        '30000000-0000-4000-8000-000000000024',
        '20000000-0000-4000-8000-000000000024',
        'summary',
        'degraded'
      );
    `);
    await expect(client.query('COMMIT')).rejects.toThrow(/requires exact durable items/iu);
    await client.query('ROLLBACK').catch(() => undefined);
    expect(
      (
        await client.query(
          "SELECT count(*)::text AS count FROM public.document_evidence_runs WHERE id='20000000-0000-4000-8000-000000000024'"
        )
      ).rows[0].count
    ).toBe('0');
    expect(
      (
        await client.query(
          'SELECT accepted_runs,source_documents,assessed_documents,degraded_documents FROM public.document_evidence_observability_totals'
        )
      ).rows[0]
    ).toEqual({
      accepted_runs: '0',
      source_documents: '0',
      assessed_documents: '0',
      degraded_documents: '0',
    });
  });
});
