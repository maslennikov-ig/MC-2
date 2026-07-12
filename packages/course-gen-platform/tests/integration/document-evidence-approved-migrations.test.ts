import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS,
  DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION,
  loadDocumentEvidenceApprovedMigrations,
  runDocumentEvidenceApprovedMigrations,
  validateDocumentEvidenceApprovedMigrationTarget,
} from '../../scripts/migrations/document-evidence-approved';
import { runDocumentEvidenceObservabilityMigration } from '../../scripts/migrations/document-evidence-observability-index';

const execFileAsync = promisify(execFile);

describe('approved document evidence migration runner', () => {
  it('pins the exact approved apply and rollback sources', async () => {
    expect(DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS.map(migration => migration.version)).toEqual([
      '20260711120000',
      '20260711130000',
      '20260711140000',
    ]);

    const loaded = await loadDocumentEvidenceApprovedMigrations();
    for (const migration of loaded) {
      expect(
        createHash('sha256')
          .update(await readFile(migration.apply.url))
          .digest('hex')
      ).toBe(migration.apply.sha256);
      expect(
        createHash('sha256')
          .update(await readFile(migration.rollback.url))
          .digest('hex')
      ).toBe(migration.rollback.sha256);
      expect(migration.apply.statements.length).toBeGreaterThan(0);
      expect(migration.rollback.statements.length).toBeGreaterThan(0);
    }
  });

  it('rejects non-PostgreSQL targets', () => {
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(
        'https://db.example.com/postgres',
        'apply',
        {}
      )
    ).toThrow(/PostgreSQL URL/u);
  });

  it('keeps remote targets disabled until every exact gate is present', () => {
    const remote = 'postgresql://postgres:secret@db.example.com:5432/postgres';
    expect(() => validateDocumentEvidenceApprovedMigrationTarget(remote, 'apply', {})).toThrow(
      /remote targets are disabled/u
    );
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(remote, 'apply', { allowRemote: true })
    ).toThrow(/confirmation/u);
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(remote, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION.apply,
      })
    ).toThrow(/sslmode=verify-full/u);
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(`${remote}?sslmode=require`, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION.apply,
      })
    ).toThrow(/sslmode=verify-full/u);
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(`${remote}?sslmode=verify-full`, 'rollback', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION.apply,
      })
    ).toThrow(/confirmation/u);
    expect(() =>
      validateDocumentEvidenceApprovedMigrationTarget(`${remote}?sslmode=verify-full`, 'apply', {
        allowRemote: true,
        confirmation: DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION.apply,
      })
    ).not.toThrow();
  });

  it('uses explicit order-sensitive confirmations', () => {
    expect(DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION).toEqual({
      apply: 'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000',
      rollback:
        'ROLL BACK REMOTE DOCUMENT EVIDENCE BASE 20260711140000 20260711130000 20260711120000',
    });
  });

  it('keeps credentials out of fail-closed CLI errors', async () => {
    const script = new URL(
      '../../scripts/migrations/document-evidence-approved.ts',
      import.meta.url
    );
    const secret = 'never-print-this-password';
    await expect(
      execFileAsync(
        process.execPath,
        [resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), fileURLToPath(script), 'apply'],
        {
          env: {
            ...process.env,
            SUPABASE_DB_URL: `postgresql://postgres:${secret}@db.example.com:5432/postgres`,
          },
        }
      )
    ).rejects.toMatchObject({
      stderr: expect.not.stringContaining(secret),
    });
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
    throw new Error('Approved migration tests require a loopback disposable _test database');
  }
  return value;
}

async function resetDatabase(): Promise<void> {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (
      version text NOT NULL PRIMARY KEY,
      statements text[],
      name text
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;
    ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(auth.jwt()->>'sub','')::uuid
    $$;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE courses(
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      generation_status text NOT NULL DEFAULT 'stage_4_clarifying',
      analysis_result jsonb
    );
    CREATE TABLE file_catalog(
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
      hash text NOT NULL
    );
    CREATE TABLE clarifying_questions(
      id uuid PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      question_text text NOT NULL DEFAULT 'question',
      question_type text NOT NULL DEFAULT 'single_choice',
      question_priority text NOT NULL DEFAULT 'important',
      question_category text,
      suggested_answers jsonb NOT NULL DEFAULT '[]',
      iteration_round integer NOT NULL DEFAULT 1,
      order_index integer NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'pending',
      user_answer jsonb,
      answer_source text,
      selected_suggestion_index integer,
      answered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    GRANT SELECT ON courses,file_catalog TO authenticated,service_role;
  `);
  await seedRepositoryHistoryBeforeApproved();
}

async function repositoryMigrationNames(): Promise<Array<{ version: string; name: string }>> {
  const directory = resolve(process.cwd(), 'supabase/migrations');
  return (await readdir(directory))
    .map(file => file.match(/^(\d{14})_(.+)\.sql$/u))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(match => ({ version: match[1], name: match[2] }))
    .sort((left, right) => left.version.localeCompare(right.version));
}

async function seedRepositoryHistoryBeforeApproved(): Promise<void> {
  const previous = (await repositoryMigrationNames()).filter(
    migration => migration.version < DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS[0].version
  );
  for (const migration of previous) {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES($1,$2,ARRAY[]::text[])`,
      [migration.version, migration.name]
    );
  }
}

appliedDescribe('approved document evidence migrations applied', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: disposableUrl(databaseUrl!) });
    await client.connect();
  });

  beforeEach(async () => resetDatabase());

  afterAll(async () => {
    if (!client) return;
    await resetDatabase();
    await client.end();
  });

  it('applies, reuses, rolls back and reapplies all approved migrations', async () => {
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).toBe('applied');
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).toBe('reused');
    expect(
      (
        await client.query(
          `SELECT version,name FROM supabase_migrations.schema_migrations
           WHERE version=ANY($1::text[]) ORDER BY version`,
          [DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS.map(migration => migration.version)]
        )
      ).rows
    ).toEqual([
      { version: '20260711120000', name: 'document_evidence' },
      { version: '20260711130000', name: 'document_conflict_auto_answers' },
      { version: '20260711140000', name: 'document_conflict_side_identity' },
    ]);
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).toBe('rolled_back');
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).toBe('reused');
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).toBe('applied');
  });

  it('fails closed when supported history and live objects diverge', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('ALTER TABLE document_evidence_decisions DROP COLUMN selected_side_handle');
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/security manifest|side identity/iu);
  });

  it('recovers exact live state when only the final history row is missing', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(
      `DELETE FROM supabase_migrations.schema_migrations WHERE version='20260711140000'`
    );
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).toBe('recovered');
  });

  it('refuses an earlier pending repository migration', async () => {
    const previous = (await repositoryMigrationNames()).filter(
      migration => migration.version < DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS[0].version
    );
    await client.query('DELETE FROM supabase_migrations.schema_migrations WHERE version=$1', [
      previous.at(-1)!.version,
    ]);
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/repository migration frontier/u);
  });

  it('refuses unknown, gapped and later migration history', async () => {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES('20250000000000','unknown_history',ARRAY[]::text[])`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/repository migration frontier/u);

    await resetDatabase();
    const loaded = await loadDocumentEvidenceApprovedMigrations();
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES($1,$2,$3::text[])`,
      [loaded[1].version, loaded[1].name, loaded[1].apply.statements]
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/supported prefix/u);

    await resetDatabase();
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES('20260711160000','unexpected_later_tail',ARRAY[]::text[])`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/repository migration frontier/u);
  });

  it('refuses base rollback while observability history and live objects remain', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await runDocumentEvidenceObservabilityMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).rejects.toThrow(/downstream.*15000.*15100|15000.*15100.*downstream/iu);
    expect(
      (
        await client.query(
          `SELECT to_regclass('public.document_evidence_runs')::text AS base,
                  to_regclass('public.document_evidence_observability_totals')::text AS totals`
        )
      ).rows[0]
    ).toEqual({ base: 'document_evidence_runs', totals: 'document_evidence_observability_totals' });

    await runDocumentEvidenceObservabilityMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'rollback',
    });
    expect(
      await runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).toBe('rolled_back');
  });

  it('refuses base rollback when downstream live residue lost its history', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await runDocumentEvidenceObservabilityMigration({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(
      `DELETE FROM supabase_migrations.schema_migrations
       WHERE version IN ('20260711150000','20260711151000')`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).rejects.toThrow(/downstream.*live|live.*downstream/iu);
    expect(
      (
        await client.query(
          `SELECT to_regclass('public.document_evidence_runs')::text AS base,
                  to_regclass('public.document_evidence_observability_totals')::text AS totals`
        )
      ).rows[0]
    ).toEqual({ base: 'document_evidence_runs', totals: 'document_evidence_observability_totals' });
  });

  it('refuses reuse after tenant policy drift', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('DROP POLICY runs_tenant_select ON document_evidence_runs');
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);
  });

  it('refuses reuse after privileged RPC or execute-grant drift', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('ALTER FUNCTION append_document_evidence_decision(jsonb) SECURITY INVOKER');
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);

    await resetDatabase();
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(
      `REVOKE EXECUTE ON FUNCTION
       materialize_document_evidence_decision_gate_atomic(uuid,uuid,uuid,text,jsonb,uuid)
       FROM service_role`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);
  });

  it('refuses reuse after constraint, trigger or index drift', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(
      'ALTER TABLE document_evidence_decisions DROP CONSTRAINT document_evidence_decisions_side_handle_format'
    );
    await client.query(
      `ALTER TABLE document_evidence_decisions
       ADD CONSTRAINT document_evidence_decisions_side_handle_format
       CHECK (selected_side_handle IS NULL OR length(selected_side_handle) > 0) NOT VALID`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);

    await resetDatabase();
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(
      'ALTER TABLE document_evidence_conflicts DISABLE TRIGGER validate_document_evidence_conflict_side_identity'
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);

    await resetDatabase();
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('DROP INDEX document_evidence_decisions_idempotency_unique');
    await client.query(
      `CREATE UNIQUE INDEX document_evidence_decisions_idempotency_unique
       ON document_evidence_decisions(id)`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/live document evidence security manifest/iu);
  });

  it('refuses rollback recovery when an introduced security object remains', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'rollback',
    });
    await client.query(`
      CREATE FUNCTION document_evidence_sha256(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$
    `);
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'rollback',
      })
    ).rejects.toThrow(/security manifest|residue/iu);
  });
});
