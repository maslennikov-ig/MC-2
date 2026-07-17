import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyQ12BasePacket,
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

const Q12_TEST_CAPABILITY = 'mc2-synthetic-q12-migration-test-capability';
const Q12_TEST_CAPABILITY_SHA256 = createHash('sha256')
  .update(Q12_TEST_CAPABILITY, 'utf8')
  .digest('hex');
const Q12_SYNTHETIC_HASH = 'a'.repeat(64);
const Q12_BASE_GUARDED_RELATIONS = [
  'document_evidence_batch_checkpoints',
  'document_evidence_conflict_checkpoints',
  'document_evidence_conflicts',
  'document_evidence_decisions',
  'document_evidence_items',
  'document_evidence_retry_applications',
  'document_evidence_runs',
];

function q12Relation(name: string): Record<string, unknown> {
  return {
    schema: 'public',
    name,
    relkind: 'r',
    parent_schema: null,
    parent_name: null,
    owner: 'postgres',
  };
}

const Q12_EXPECTED_CATALOG = {
  migrations: {
    '20260711140000': {
      relations: Q12_BASE_GUARDED_RELATIONS.map(q12Relation),
      migration_file_sha256: Q12_SYNTHETIC_HASH,
      catalog_sha256: Q12_SYNTHETIC_HASH,
    },
    '20260711151000': {
      relations: [q12Relation('document_evidence_observability_totals')],
      migration_file_sha256: Q12_SYNTHETIC_HASH,
      catalog_sha256: Q12_SYNTHETIC_HASH,
    },
  },
};

// Faithful minimal stand-in for the frozen W q12_guard barrier: exactly the
// extend_guard / enforce_write_barrier / assert_capability contract the migration
// depends on. Uses the sha256() builtin instead of extensions.digest so the
// fixture does not depend on pgcrypto install ordering, and covers only
// relkind='r' relations (the base and totals tables are unpartitioned).
const Q12_SYNTHETIC_BARRIER_SQL = `
CREATE SCHEMA q12_guard AUTHORIZATION postgres;
CREATE TABLE q12_guard.active_run(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  capability_sha256 text NOT NULL, expected_catalog jsonb NOT NULL);
CREATE TABLE q12_guard.migration_guards(migration text PRIMARY KEY, catalog_sha256 text NOT NULL,
  migration_file_sha256 text NOT NULL, stable_expected jsonb NOT NULL, relation_set jsonb NOT NULL);
CREATE FUNCTION q12_guard.assert_capability() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,q12_guard AS $fn$
DECLARE active q12_guard.active_run%ROWTYPE; supplied text;
BEGIN
  SELECT * INTO STRICT active FROM q12_guard.active_run WHERE singleton;
  IF session_user='postgres' THEN supplied := current_setting('megacampus.q12_capability',true);
  ELSE RAISE EXCEPTION 'Q12 database writes are maintenance-guarded'; END IF;
  IF encode(sha256(convert_to(COALESCE(supplied,''),'UTF8')),'hex') IS DISTINCT FROM active.capability_sha256 THEN
    RAISE EXCEPTION 'Q12 database writes require the active run capability'; END IF;
END $fn$;
CREATE FUNCTION q12_guard.enforce_write_barrier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,q12_guard AS $fn$
BEGIN
  PERFORM q12_guard.assert_capability();
  IF TG_OP='DELETE' THEN RETURN OLD; ELSIF TG_OP='TRUNCATE' THEN RETURN NULL; ELSE RETURN NEW; END IF;
END $fn$;
CREATE FUNCTION q12_guard.enforce_ddl_barrier() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,q12_guard AS $fn$ BEGIN PERFORM q12_guard.assert_capability(); END $fn$;
CREATE FUNCTION q12_guard.extend_guard(p_migration text,p_expected_relations jsonb,
  p_migration_file_sha256 text,p_expected_catalog_sha256 text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,q12_guard AS $fn$
DECLARE expected jsonb; relation record; captured jsonb;
BEGIN
  PERFORM q12_guard.assert_capability();
  SELECT expected_catalog INTO expected FROM q12_guard.active_run WHERE singleton FOR UPDATE;
  IF p_migration NOT IN ('20260711140000','20260711151000')
     OR p_expected_relations IS DISTINCT FROM expected->'migrations'->p_migration->'relations'
     OR p_migration_file_sha256 IS DISTINCT FROM expected->'migrations'->p_migration->>'migration_file_sha256'
     OR p_expected_catalog_sha256 IS DISTINCT FROM expected->'migrations'->p_migration->>'catalog_sha256' THEN
    RAISE EXCEPTION 'migration guard extension differs from the frozen catalog'; END IF;
  IF p_migration='20260711151000' AND NOT EXISTS (
    SELECT 1 FROM q12_guard.migration_guards WHERE migration='20260711140000') THEN
    RAISE EXCEPTION 'observability guard extension requires the committed base guard'; END IF;
  SELECT jsonb_agg(jsonb_build_object('schema',x.schema,'name',x.name) ORDER BY x.name) INTO captured
  FROM jsonb_to_recordset(p_expected_relations) AS x(schema text,name text,relkind "char",owner text)
  JOIN pg_namespace n ON n.nspname=x.schema
  JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=x.name AND c.relkind=x.relkind
  JOIN pg_roles owner ON owner.oid=c.relowner AND owner.rolname=x.owner;
  IF captured IS NULL OR jsonb_array_length(captured)<>jsonb_array_length(p_expected_relations) THEN
    RAISE EXCEPTION 'new migration stable relation catalog drift'; END IF;
  FOR relation IN SELECT * FROM jsonb_to_recordset(p_expected_relations) AS x(schema text,name text) ORDER BY x.name LOOP
    EXECUTE format('CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
    EXECUTE format('CREATE TRIGGER q12_guard_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION q12_guard.enforce_write_barrier()',relation.schema,relation.name);
  END LOOP;
  INSERT INTO q12_guard.migration_guards VALUES(p_migration,p_expected_catalog_sha256,p_migration_file_sha256,p_expected_relations,captured);
END $fn$;
`;

async function installQ12Barrier(): Promise<void> {
  await client.query(Q12_SYNTHETIC_BARRIER_SQL);
  await client.query(
    `INSERT INTO q12_guard.active_run(capability_sha256,expected_catalog) VALUES($1,$2::jsonb)`,
    [Q12_TEST_CAPABILITY_SHA256, JSON.stringify(Q12_EXPECTED_CATALOG)]
  );
  await client.query(
    `CREATE EVENT TRIGGER q12_guard_ddl_command_start ON ddl_command_start
       EXECUTE FUNCTION q12_guard.enforce_ddl_barrier()`
  );
  // Direct postgres clients bind the capability before any migration statement,
  // exactly as bindQ12MigrationSession does for the pooler in live mode.
  await client.query(`SELECT set_config('megacampus.q12_capability',$1,false)`, [
    Q12_TEST_CAPABILITY,
  ]);
}

async function teardownQ12Barrier(): Promise<void> {
  await client
    .query(`SELECT set_config('megacampus.q12_capability',$1,false)`, [Q12_TEST_CAPABILITY])
    .catch(() => undefined);
  await client
    .query(`DROP EVENT TRIGGER IF EXISTS q12_guard_ddl_command_start`)
    .catch(() => undefined);
  await client.query(`DROP SCHEMA IF EXISTS q12_guard CASCADE`).catch(() => undefined);
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

  // MCP-style tolerance (versions absent from repo files, max == frontier) is proven
  // directly against assertRepositoryMigrationFrontier in the docker-free unit suite
  // (tests/unit/scripts/document-evidence-frontier.test.ts), and end-to-end with MCP-shaped
  // source history in the real-PG17 composed==real-source plan proof — the full apply here
  // is gated on the pinned Supabase image's security manifest, so it cannot run on a vanilla
  // PG17. These integration negatives throw at the frontier BEFORE the image-pinned apply.
  it('refuses unknown history NEWER than the frontier, a between-frontier version, and a gapped prefix (round-16)', async () => {
    // A version strictly ABOVE the reviewed frontier (not our chain) -> unknown newer history.
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

    await resetDatabase();
    // A version strictly BETWEEN the frontier and the first chain version -> unknown newer.
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES('20260706000000','between_frontier_and_chain',ARRAY[]::text[])`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/repository migration frontier/u);

    await resetDatabase();
    // The SECOND chain migration present without the first -> unsupported prefix (gap).
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

  it('refuses reuse after the clarifying subject index keeps its name but changes shape', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('DROP INDEX clarifying_questions_document_evidence_subject_unique');
    await client.query(
      `CREATE UNIQUE INDEX clarifying_questions_document_evidence_subject_unique
       ON clarifying_questions(id)`
    );
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/clarifying.*subject.*index|security manifest/iu);
  });

  it('refuses reuse when the required pgcrypto digest dependency is removed', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query('DROP EXTENSION pgcrypto CASCADE');
    await expect(
      runDocumentEvidenceApprovedMigrations({
        databaseUrl: disposableUrl(databaseUrl!),
        direction: 'apply',
      })
    ).rejects.toThrow(/pgcrypto|digest dependency|security manifest/iu);
  });

  it('refuses base rollback for an unhistoried downstream increment function', async () => {
    await runDocumentEvidenceApprovedMigrations({
      databaseUrl: disposableUrl(databaseUrl!),
      direction: 'apply',
    });
    await client.query(`
      CREATE FUNCTION increment_document_evidence_terminal_totals()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
      BEGIN RETURN NEW; END
      $$
    `);
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
                  to_regprocedure('public.increment_document_evidence_terminal_totals()')::text
                    AS downstream_function`
        )
      ).rows[0]
    ).toEqual({
      base: 'document_evidence_runs',
      downstream_function: 'increment_document_evidence_terminal_totals()',
    });
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

  it('publishes the base guard in the same commit as the migration via extend_guard', async () => {
    await installQ12Barrier();
    try {
      const migrations = await loadDocumentEvidenceApprovedMigrations();
      expect(await applyQ12BasePacket(client, migrations)).toBe('applied');

      // The W barrier installs a row and a TRUNCATE guard on every new base table.
      const guards = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_trigger t
           JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_namespace ns ON ns.oid=c.relnamespace
          WHERE ns.nspname='public' AND NOT t.tgisinternal
            AND t.tgname LIKE 'q12_guard_%' AND c.relname LIKE 'document_evidence_%'`
      );
      expect(guards.rows[0].n).toBe(Q12_BASE_GUARDED_RELATIONS.length * 2);

      // The tables, all three history rows, and the guard registration land atomically.
      expect(
        (await client.query(`SELECT to_regclass('public.document_evidence_runs')::text AS t`))
          .rows[0].t
      ).toBe('document_evidence_runs');
      expect(
        (
          await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations
               WHERE version IN ('20260711120000','20260711130000','20260711140000')`
          )
        ).rows[0].n
      ).toBe(3);
      expect(
        (
          await client.query<{ migration: string }>(
            `SELECT migration FROM q12_guard.migration_guards`
          )
        ).rows.map(row => row.migration)
      ).toEqual(['20260711140000']);
    } finally {
      await teardownQ12Barrier();
    }
  });
});
