/* eslint-disable max-lines -- one cohesive Q12 plan builder + drill-seam contract suite */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py'
);
const WRAPPER = resolve(REPO_ROOT, 'deploy/qdrant/q12-live-cutover.sh');
const BARRIER = resolve(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh');
const CAPTURE = resolve(REPO_ROOT, 'deploy/qdrant/q12-migration-plan-capture.py');
const ROLES = resolve(REPO_ROOT, 'deploy/qdrant/q12-migration-plan-roles.py');
const CORE = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
const STRUCTURAL_CATALOG = resolve(REPO_ROOT, 'deploy/qdrant/q12-structural-catalog.sql');
const EXPECTED_SCHEMA = 'megacampus.q12.expected-post-migration-catalog/v1';
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const RELEASE_SHA = '1'.repeat(40);
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'q12-plan-terminal-proof-password';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The exact frozen expected-catalog jq program from q12-database-barrier.sh. */
function frozenBarrierCatalogFilter(): string {
  const source = readFileSync(BARRIER, 'utf8');
  const marker = `jq -e --arg schema "$EXPECTED_SCHEMA" '`;
  const start = source.indexOf(marker) + marker.length;
  const end = source.indexOf(`' <<<"$expected_json"`, start);
  if (start < marker.length || end < 0) throw new Error('frozen barrier filter not found');
  return source.slice(start, end);
}

function assertPassesFrozenBarrier(catalogJson: string): void {
  const result = spawnSync(
    'jq',
    ['-e', '--arg', 'schema', EXPECTED_SCHEMA, frozenBarrierCatalogFilter()],
    { input: catalogJson, encoding: 'utf8', env: { PATH: process.env.PATH } }
  );
  expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
}

function guardedRelations(): Array<Record<string, unknown>> {
  const publicRelations = Array.from({ length: 47 }, (_, index) => ({
    schema: 'public',
    name: `public_table_${String(index).padStart(2, '0')}`,
    oid: 100 + index,
    relkind: 'r',
    parent_oid: null,
    owner: 'postgres',
  }));
  const authRelations = Array.from({ length: 22 }, (_, index) => ({
    schema: 'auth',
    name: `auth_table_${String(index).padStart(2, '0')}`,
    oid: 200 + index,
    relkind: 'r',
    parent_oid: null,
    owner: 'postgres',
  }));
  const storageRelations = [
    'buckets',
    'buckets_analytics',
    'objects',
    's3_multipart_uploads',
    's3_multipart_uploads_parts',
  ].map((name, index) => ({
    schema: 'storage',
    name,
    oid: 300 + index,
    relkind: 'r',
    parent_oid: null,
    owner: 'postgres',
  }));
  return [
    ...publicRelations,
    ...authRelations,
    ...storageRelations,
    { schema: 'cron', name: 'job', oid: 400, relkind: 'r', parent_oid: null, owner: 'postgres' },
    {
      schema: 'net',
      name: 'http_request_queue',
      oid: 401,
      relkind: 'r',
      parent_oid: null,
      owner: 'postgres',
    },
  ];
}

function migrationRelation(name: string): Record<string, unknown> {
  return {
    schema: 'public',
    name,
    relkind: 'r',
    parent_schema: null,
    parent_name: null,
    owner: 'postgres',
  };
}

function baseEvidence(): Record<string, unknown> {
  return {
    schema_version: 'megacampus.q12.plan-capture/v1',
    database: 'postgres',
    database_owner: 'postgres',
    migration_frontier: '20260704150249',
    baseline_structural_sha256: 'a'.repeat(64),
    guarded_relations: guardedRelations(),
    cron_jobs: Array.from({ length: 8 }, (_, index) => ({
      jobid: index + 1,
      username: 'postgres',
      command_sha256: sha256(`SELECT ${index + 1}`),
    })),
    migrations: {
      '20260711140000': {
        catalog_sha256: 'c'.repeat(64),
        migration_file_sha256: 'e'.repeat(64),
        // Deliberately unsorted so we prove the builder canonicalizes ordering.
        relations: [
          migrationRelation('document_evidence_retry_applications'),
          migrationRelation('document_evidence_runs'),
          migrationRelation('document_evidence_items'),
          migrationRelation('document_evidence_batch_checkpoints'),
          migrationRelation('document_evidence_conflicts'),
          migrationRelation('document_evidence_decisions'),
          migrationRelation('document_evidence_conflict_checkpoints'),
        ],
      },
      '20260711151000': {
        catalog_sha256: 'b'.repeat(64),
        migration_file_sha256: 'f'.repeat(64),
        relations: [migrationRelation('document_evidence_observability_totals')],
      },
    },
  };
}

interface PlanFixture {
  runRoot: string;
  dbUrl: string;
  ca: string;
  catalogPath: string;
}

function planFixture(): PlanFixture {
  const runRoot = mkdtempSync('/tmp/mc2-q12-plan-');
  temporaryDirectories.push(runRoot);
  chmodSync(runRoot, 0o700);
  const dbUrl = join(runRoot, 'supabase_db_url');
  const ca = join(runRoot, 'prod-ca.crt');
  writeFileSync(
    dbUrl,
    'postgresql://postgres.diqooqbuchsliypgwksu:synthetic@aws-1-us-east-2.pooler.supabase.com:5432/postgres\n',
    { mode: 0o600 }
  );
  chmodSync(dbUrl, 0o600);
  writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
  chmodSync(ca, 0o644);
  return { runRoot, dbUrl, ca, catalogPath: join(runRoot, 'expected-post-migration-catalog.json') };
}

function runPlan(
  fixture: PlanFixture,
  evidence: unknown
): ReturnType<typeof spawnSync> & { output?: Record<string, string> } {
  const spec = {
    run_id: RUN_ID,
    release_sha: RELEASE_SHA,
    db_url_file: fixture.dbUrl,
    ca_file: fixture.ca,
    run_root: fixture.runRoot,
    evidence,
  };
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify(spec),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
  });
  return result;
}

describe.runIf(RUN_REAL_CONTROLLER)('Q12 expected-post-migration-catalog plan builder', () => {
  it('emits an owner-only catalog that passes the frozen barrier schema and self-binds its sha256', () => {
    const fixture = planFixture();

    const result = runPlan(fixture, baseEvidence());

    expect(result.status, result.stderr).toBe(0);
    const emitted = readFileSync(fixture.catalogPath);
    expect(statSync(fixture.catalogPath).mode & 0o777).toBe(0o400);
    assertPassesFrozenBarrier(emitted.toString('utf8'));
    const plan = JSON.parse(result.stdout) as Record<string, string>;
    expect(plan.expected_catalog_path).toBe(fixture.catalogPath);
    expect(plan.expected_catalog_sha256).toBe(sha256(emitted));
    const catalog = JSON.parse(emitted.toString('utf8')) as Record<string, any>;
    expect(catalog.expected_post_migration_catalog_sha256).toBe('b'.repeat(64));
    expect(catalog.migrations['20260711151000'].catalog_sha256).toBe(
      catalog.expected_post_migration_catalog_sha256
    );
    expect(catalog.migrations['20260711140000'].relations.map((r: any) => r.name)).toEqual([
      'document_evidence_batch_checkpoints',
      'document_evidence_conflict_checkpoints',
      'document_evidence_conflicts',
      'document_evidence_decisions',
      'document_evidence_items',
      'document_evidence_retry_applications',
      'document_evidence_runs',
    ]);
    expect(catalog.release_sha).toBe(RELEASE_SHA);
    expect(catalog.inventory_counts).toEqual({
      public: 47,
      auth: 22,
      storage: 5,
      cron_jobs: 8,
      pg_net_queue: 0,
    });
  });

  it('re-publishes the exact immutable catalog bytes on a second identical run', () => {
    const fixture = planFixture();
    const first = runPlan(fixture, baseEvidence());
    expect(first.status, first.stderr).toBe(0);
    const firstBytes = readFileSync(fixture.catalogPath);

    const second = runPlan(fixture, baseEvidence());

    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(fixture.catalogPath)).toEqual(firstBytes);
  });

  it.each([
    [
      'drops a guarded relation',
      (evidence: any) => {
        evidence.guarded_relations.pop();
      },
    ],
    [
      'renames a required storage relation',
      (evidence: any) => {
        evidence.guarded_relations.find((r: any) => r.name === 'buckets').name = 'not_buckets';
      },
    ],
    [
      'guards auth.schema_migrations',
      (evidence: any) => {
        evidence.guarded_relations.find((r: any) => r.schema === 'auth').name = 'schema_migrations';
      },
    ],
    [
      'uses an unexpected migration key',
      (evidence: any) => {
        evidence.migrations['20260711150000'] = evidence.migrations['20260711140000'];
      },
    ],
    [
      'collides a migration relation with a guarded relation',
      (evidence: any) => {
        evidence.migrations['20260711151000'].relations = [migrationRelation('public_table_00')];
      },
    ],
    [
      'breaks the frozen migration frontier',
      (evidence: any) => {
        evidence.migration_frontier = '20260704150250';
      },
    ],
    [
      'supplies a non-postgres cron username',
      (evidence: any) => {
        evidence.cron_jobs[0].username = 'anon';
      },
    ],
  ] as const)(
    'fails closed and emits no catalog when the capture evidence %s',
    (_label, mutate) => {
      const fixture = planFixture();
      const evidence = baseEvidence();
      mutate(evidence);

      const result = runPlan(fixture, evidence);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/plan rejected|plan error/i);
      expect(() => readFileSync(fixture.catalogPath)).toThrow();
    }
  );

  it('routes the deployed wrapper plan/--plan tokens into the core plan mode', () => {
    for (const token of ['plan', '--plan']) {
      const help = spawnSync('/usr/bin/bash', [WRAPPER, token, '--help'], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
      });
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain('plan');
      expect(help.stdout).toContain('--release-sha');
      expect(help.stdout).toContain('--db-url-file');
    }
  });
});

describe('Q12 plan capture helper and builder input hardening', () => {
  it('rejects an unsafe --container value before any exec', () => {
    const result = spawnSync('/usr/bin/python3', [CAPTURE, '--container', 'evil;rm -rf /'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/invalid --container/iu);
  });

  it('rejects a non-absolute MC2_Q12_PLAN_PSQL before any exec', () => {
    const result = spawnSync('/usr/bin/python3', [CAPTURE], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        LC_ALL: 'C',
        LANG: 'C',
        MC2_Q12_PLAN_PSQL: 'relative/psql',
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/absolute regular file/iu);
  });

  it.each(['oid', 'jobid'] as const)(
    'fails closed on a boolean-as-integer %s in capture evidence',
    field => {
      const fixture = planFixture();
      const evidence = baseEvidence() as any;
      if (field === 'oid') evidence.guarded_relations[0].oid = true;
      else evidence.cron_jobs[0].jobid = true;

      const result = runPlan(fixture, evidence);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/plan rejected|plan error/iu);
      expect(existsSync(fixture.catalogPath)).toBe(false);
    }
  );
});

describe.runIf(REAL_PG17)('Q12 plan capture against disposable PostgreSQL 17.10', () => {
  it('captures the real structural catalog and builds a barrier-valid plan catalog', async () => {
    const container = `mc2-q12-plan-${process.pid}-${Date.now()}`;
    const docker = (args: string[], input?: string) =>
      spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60_000 });
    const started = docker([
      'run',
      '-d',
      '--rm',
      '--name',
      container,
      '-e',
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_IMAGE,
    ]);
    expect(started.status, started.stderr).toBe(0);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const logs = docker(['logs', container]);
        const probe = docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'postgres']);
        if (
          probe.status === 0 &&
          `${logs.stdout}${logs.stderr}`.includes(
            'PostgreSQL init process complete; ready for start up.'
          )
        ) {
          ready = true;
          break;
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
      }
      expect(ready, docker(['logs', container]).stderr).toBe(true);

      // Synthetic Supabase-shaped source: 47 public + 22 auth + 5 named
      // storage + cron.job + net.http_request_queue (76 guarded), plus decoys
      // the schema/name filter must drop regardless of the caller's superuser
      // status (realtime.messages, cron.job_run_details, net.http_response).
      // In real Supabase `postgres` is not a superuser, so auth/storage
      // internal tables are dropped by the TRIGGER-privilege test; that leg is
      // Supabase-config-specific and is covered by the synthetic unit cases.
      const setup = docker(
        ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
        `
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);
-- MCP-style history: apply-time version timestamps with NO same-named repo file, max ==
-- the reviewed frontier — exactly how this project's production history is generated.
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
  ('20260101093012','mcp_apply_alpha'),
  ('20260515164533','mcp_apply_beta'),
  ('20260704150249','frontier');
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA cron;
CREATE SCHEMA net;
CREATE SCHEMA realtime;
DO $$ BEGIN
  FOR i IN 0..46 LOOP EXECUTE format('CREATE TABLE public.public_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
  FOR i IN 0..21 LOOP EXECUTE format('CREATE TABLE auth.auth_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
END $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.buckets_analytics(id text PRIMARY KEY);
CREATE TABLE storage.objects(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads_parts(id bigint PRIMARY KEY);
CREATE TABLE realtime.messages(id bigint PRIMARY KEY);
CREATE TABLE cron.job(jobid bigint PRIMARY KEY, schedule text, command text, nodename text, nodeport int, database text, username text, active boolean);
CREATE TABLE cron.job_run_details(runid bigint PRIMARY KEY);
INSERT INTO cron.job SELECT v,'0 * * * *','SELECT '||v,'localhost',5432,'postgres','postgres',true FROM generate_series(1,8) v;
CREATE TABLE net.http_request_queue(id bigint PRIMARY KEY);
CREATE TABLE net.http_response(id bigint PRIMARY KEY);
`
      );
      expect(setup.status, setup.stderr).toBe(0);

      const structuralSql = readFileSync(STRUCTURAL_CATALOG, 'utf8').trim();
      const capture = (): Record<string, any> => {
        const result = spawnSync('/usr/bin/python3', [CAPTURE, '--container', container], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
        });
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout) as Record<string, any>;
      };
      expect(structuralSql.includes(';')).toBe(false);

      const baseline = capture();
      expect(baseline.guarded_relations).toHaveLength(76);
      expect(baseline.cron_jobs).toHaveLength(8);
      expect(baseline.migration_frontier).toBe('20260704150249');
      const baselinePublic = new Set(
        (baseline.public_relations as Array<{ name: string }>).map(relation => relation.name)
      );

      // Apply the base packet (creates the 7 guarded base tables).
      const basePacket = docker(
        ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
        [
          'document_evidence_runs',
          'document_evidence_items',
          'document_evidence_batch_checkpoints',
          'document_evidence_conflicts',
          'document_evidence_decisions',
          'document_evidence_conflict_checkpoints',
          'document_evidence_retry_applications',
        ]
          .map(name => `CREATE TABLE public.${name}(id bigint PRIMARY KEY);`)
          .join('\n')
      );
      expect(basePacket.status, basePacket.stderr).toBe(0);
      const afterBase = capture();
      const afterBaseNames = (afterBase.public_relations as Array<{ name: string }>).map(
        r => r.name
      );

      // Apply the observability packet (creates the totals table).
      const observability = docker(
        ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
        'CREATE TABLE public.document_evidence_observability_totals(singleton boolean PRIMARY KEY);'
      );
      expect(observability.status, observability.stderr).toBe(0);
      const afterObservability = capture();

      const delta = (
        after: Array<Record<string, any>>,
        beforeNames: Set<string>
      ): Array<Record<string, any>> =>
        after
          .filter(relation => !beforeNames.has(relation.name))
          .map(relation => ({
            schema: relation.schema,
            name: relation.name,
            relkind: relation.relkind,
            parent_schema: relation.parent_schema,
            parent_name: relation.parent_name,
            owner: relation.owner,
          }));

      const evidence = {
        database: baseline.database,
        database_owner: baseline.database_owner,
        migration_frontier: baseline.migration_frontier,
        baseline_structural_sha256: baseline.structural_sha256,
        guarded_relations: baseline.guarded_relations,
        cron_jobs: baseline.cron_jobs,
        migrations: {
          '20260711140000': {
            catalog_sha256: afterBase.structural_sha256,
            migration_file_sha256: sha256(
              readFileSync(
                resolve(
                  REPO_ROOT,
                  'packages/course-gen-platform/supabase/migrations/20260711140000_document_conflict_side_identity.sql'
                )
              )
            ),
            relations: delta(afterBase.public_relations, baselinePublic),
          },
          '20260711151000': {
            catalog_sha256: afterObservability.structural_sha256,
            migration_file_sha256: sha256(
              readFileSync(
                resolve(
                  REPO_ROOT,
                  'packages/course-gen-platform/supabase/migrations/20260711151000_document_evidence_observability_totals.sql'
                )
              )
            ),
            relations: delta(afterObservability.public_relations, new Set(afterBaseNames)),
          },
        },
      };

      const fixture = planFixture();
      const result = runPlan(fixture, evidence);
      expect(result.status, result.stderr).toBe(0);
      const emitted = readFileSync(fixture.catalogPath);
      assertPassesFrozenBarrier(emitted.toString('utf8'));
      const catalog = JSON.parse(emitted.toString('utf8')) as Record<string, any>;
      expect(catalog.baseline_structural_sha256).toBe(baseline.structural_sha256);
      expect(catalog.expected_post_migration_catalog_sha256).toBe(
        afterObservability.structural_sha256
      );
      expect(catalog.migrations['20260711140000'].relations.map((r: any) => r.name)).toEqual([
        'document_evidence_batch_checkpoints',
        'document_evidence_conflict_checkpoints',
        'document_evidence_conflicts',
        'document_evidence_decisions',
        'document_evidence_items',
        'document_evidence_retry_applications',
        'document_evidence_runs',
      ]);
      expect(catalog.migrations['20260711151000'].relations.map((r: any) => r.name)).toEqual([
        'document_evidence_observability_totals',
      ]);
    } finally {
      docker(['rm', '-f', container]);
    }
  }, 120_000);
});

describe.runIf(REAL_PG17)('Q12 live plan orchestration against disposable PostgreSQL 17.10', () => {
  const docker = (args: string[], input?: string) =>
    spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60_000 });
  let sourceContainer = '';

  // Synthetic Supabase-shaped source that hosts the REAL five migration files:
  // 47 public (44 dummies + courses/organizations/clarifying_questions, the FK /
  // RLS / index dependencies of the migrations), 22 auth, 5 named storage,
  // cron.job(8), net.http_request_queue, the frozen source frontier row, auth
  // helper functions, plus schema/name decoys the guarded filter must drop.
  const SOURCE_SCHEMA = `
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);
-- MCP-style history: apply-time version timestamps with NO same-named repo file, max ==
-- the reviewed frontier — exactly how this project's production history is generated.
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
  ('20260101093012','mcp_apply_alpha'),
  ('20260515164533','mcp_apply_beta'),
  ('20260704150249','frontier');
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA cron;
CREATE SCHEMA net;
CREATE SCHEMA realtime;
-- A §3-allowlisted app role absent from a vanilla isolate: the restore of the
-- table it owns aborts unless the role bootstrap ran first.
CREATE ROLE admin LOGIN NOINHERIT;
ALTER ROLE postgres SET search_path TO "$user", public, extensions;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT '{}'::jsonb $fn$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT 'service_role'::text $fn$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $fn$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.courses(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  generation_status text
);
CREATE TABLE public.clarifying_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  question_category text,
  question_priority text,
  status text,
  question_type text,
  suggested_answers jsonb,
  user_answer jsonb,
  answer_source text,
  selected_suggestion_index integer,
  answered_at timestamptz
);
DO $seed$ BEGIN
  FOR i IN 0..43 LOOP EXECUTE format('CREATE TABLE public.public_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
  FOR i IN 0..21 LOOP EXECUTE format('CREATE TABLE auth.auth_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
END $seed$;
CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.buckets_analytics(id text PRIMARY KEY);
CREATE TABLE storage.objects(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads_parts(id bigint PRIMARY KEY);
CREATE TABLE realtime.messages(id bigint PRIMARY KEY);
ALTER TABLE realtime.messages OWNER TO admin;
CREATE TABLE cron.job(jobid bigint PRIMARY KEY, schedule text, command text, nodename text, nodeport int, database text, username text, active boolean);
CREATE TABLE cron.job_run_details(runid bigint PRIMARY KEY);
INSERT INTO cron.job SELECT v,'0 * * * *','SELECT '||v,'localhost',5432,'postgres','postgres',true FROM generate_series(1,8) v;
CREATE TABLE net.http_request_queue(id bigint PRIMARY KEY);
CREATE TABLE net.http_response(id bigint PRIMARY KEY);
-- A no-dependent source function the injectMissing drill can DROP from the isolate to
-- simulate a MISSING source object (a function, so it does not change guarded-relation counts).
CREATE FUNCTION public.q12_missing_probe() RETURNS integer LANGUAGE sql IMMUTABLE AS $fn$ SELECT 1 $fn$;
`;

  beforeAll(async () => {
    sourceContainer = `mc2-q12-plan-src-${process.pid}-${Date.now()}`;
    const started = docker([
      'run',
      '-d',
      '--rm',
      '--name',
      sourceContainer,
      '-e',
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_IMAGE,
    ]);
    if (started.status !== 0) throw new Error(`source run failed: ${started.stderr}`);
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const logs = docker(['logs', sourceContainer]);
      const probe = docker([
        'exec',
        sourceContainer,
        'pg_isready',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ]);
      if (
        probe.status === 0 &&
        `${logs.stdout}${logs.stderr}`.includes(
          'PostgreSQL init process complete; ready for start up.'
        )
      ) {
        ready = true;
        break;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
    }
    if (!ready) throw new Error(`source not ready: ${docker(['logs', sourceContainer]).stderr}`);
    const setup = docker(
      ['exec', '-i', sourceContainer, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
      SOURCE_SCHEMA
    );
    if (setup.status !== 0) throw new Error(`source schema failed: ${setup.stderr}`);
  }, 120_000);

  afterAll(() => {
    if (sourceContainer) docker(['rm', '-f', sourceContainer]);
  });

  function applySeam(): string {
    const dir = mkdtempSync('/tmp/mc2-q12-plan-seam-');
    temporaryDirectories.push(dir);
    const script = join(dir, 'apply.sh');
    writeFileSync(
      script,
      `#!/usr/bin/env bash
set -euo pipefail
packet="$1"
c="$MC2_Q12_PLAN_ISOLATE_CONTAINER"
d="$MC2_Q12_PLAN_DOCKER"
mig="$MC2_Q12_PLAN_REPO_ROOT/packages/course-gen-platform/supabase/migrations"
apply() {
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "\${MC2_Q12_PLAN_ISOLATE_DBNAME:-postgres}" < "$mig/$3"
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "\${MC2_Q12_PLAN_ISOLATE_DBNAME:-postgres}" -c \\
    "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('$1','$2',ARRAY['$1']::text[]);"
}
# The pinned Supabase image ships these roles; a vanilla PG17 isolate needs
# them created before the real migrations can GRANT to them.
"$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "\${MC2_Q12_PLAN_ISOLATE_DBNAME:-postgres}" <<'ROLES'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
END
$roles$;
ROLES
case "$packet" in
  base)
    apply 20260711120000 document_evidence 20260711120000_document_evidence.sql
    apply 20260711130000 document_conflict_auto_answers 20260711130000_document_conflict_auto_answers.sql
    apply 20260711140000 document_conflict_side_identity 20260711140000_document_conflict_side_identity.sql
    ;;
  observability)
    apply 20260711150000 document_evidence_observability_index 20260711150000_document_evidence_observability_index.sql
    apply 20260711151000 document_evidence_observability_totals 20260711151000_document_evidence_observability_totals.sql
    ;;
  *) echo "unknown packet $packet" >&2; exit 2 ;;
esac
`,
      { mode: 0o755 }
    );
    chmodSync(script, 0o755);
    return script;
  }

  function runLivePlan(
    fixture: PlanFixture,
    extraEnv: Record<string, string> = {}
  ): ReturnType<typeof spawnSync> {
    return spawnSync(
      '/usr/bin/python3',
      [
        CORE,
        'plan',
        '--run-id',
        RUN_ID,
        '--release-sha',
        RELEASE_SHA,
        '--db-url-file',
        fixture.dbUrl,
        '--ca-file',
        fixture.ca,
        '--run-root',
        fixture.runRoot,
      ],
      {
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          LC_ALL: 'C',
          LANG: 'C',
          MC2_Q12_PLAN_RESTORE_MODE: 'direct',
          MC2_Q12_PLAN_SOURCE_CONTAINER: sourceContainer,
          MC2_Q12_PLAN_RESTORE_IMAGE: POSTGRES_IMAGE,
          MC2_Q12_PLAN_MIGRATION_APPLY: applySeam(),
          MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
          ...extraEnv,
        },
      }
    );
  }

  function leftoverIsolates(): string[] {
    return docker([
      'ps',
      '-a',
      '--filter',
      `label=com.megacampus.q12.plan-run=${RUN_ID}`,
      '--format',
      '{{.Names}}',
    ])
      .stdout.split('\n')
      .filter(Boolean);
  }

  it('restores the source, proves structural equality, applies the real five files, and emits a barrier-valid catalog', () => {
    const fixture = planFixture();

    const result = runLivePlan(fixture);

    expect(result.status, result.stderr).toBe(0);
    const emitted = readFileSync(fixture.catalogPath);
    expect(statSync(fixture.catalogPath).mode & 0o777).toBe(0o400);
    assertPassesFrozenBarrier(emitted.toString('utf8'));
    const plan = JSON.parse(result.stdout) as Record<string, string>;
    expect(plan.expected_catalog_sha256).toBe(sha256(emitted));
    const catalog = JSON.parse(emitted.toString('utf8')) as Record<string, any>;
    expect(catalog.guarded_relations).toHaveLength(76);
    expect(catalog.baseline_structural_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(catalog.expected_post_migration_catalog_sha256).toBe(
      catalog.migrations['20260711151000'].catalog_sha256
    );
    expect(catalog.migrations['20260711140000'].relations.map((r: any) => r.name)).toEqual([
      'document_evidence_batch_checkpoints',
      'document_evidence_conflict_checkpoints',
      'document_evidence_conflicts',
      'document_evidence_decisions',
      'document_evidence_items',
      'document_evidence_retry_applications',
      'document_evidence_runs',
    ]);
    expect(catalog.migrations['20260711151000'].relations.map((r: any) => r.name)).toEqual([
      'document_evidence_observability_totals',
    ]);
    expect(catalog.migrations['20260711140000'].migration_file_sha256).toBe(
      sha256(
        readFileSync(
          resolve(
            REPO_ROOT,
            'packages/course-gen-platform/supabase/migrations/20260711140000_document_conflict_side_identity.sql'
          )
        )
      )
    );
    // The post-migration structural hash must differ from the pre-migration one.
    expect(catalog.migrations['20260711140000'].catalog_sha256).not.toBe(
      catalog.baseline_structural_sha256
    );
    expect(leftoverIsolates()).toEqual([]);
  }, 180_000);

  it('fails closed when the restored isolate is not object-complete against the source and reclaims the isolate', () => {
    const fixture = planFixture();

    const result = runLivePlan(fixture, { MC2_Q12_PLAN_FAULT: 'equality' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not object-complete/iu);
    expect(existsSync(fixture.catalogPath)).toBe(false);
    expect(leftoverIsolates()).toEqual([]);
  }, 180_000);

  it('lets a teardown failure override success after the catalog is bound', () => {
    const fixture = planFixture();

    const result = runLivePlan(fixture, { MC2_Q12_PLAN_FAULT: 'teardown' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/teardown failed|cleanup overrides/iu);
    // The catalog is emitted and bound before teardown runs.
    expect(existsSync(fixture.catalogPath)).toBe(true);
    assertPassesFrozenBarrier(readFileSync(fixture.catalogPath, 'utf8'));
    // Cleanup-override still reclaims the diagnostic resources.
    expect(leftoverIsolates()).toEqual([]);
  }, 180_000);
});

describe('Q12 plan §3 role bootstrap generator', () => {
  function fullRole(
    name: string,
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      name,
      rolsuper: false,
      rolinherit: true,
      rolcreaterole: false,
      rolcreatedb: false,
      rolcanlogin: false,
      rolreplication: false,
      rolconnlimit: -1,
      rolvaliduntil: null,
      rolbypassrls: false,
      ...overrides,
    };
  }

  function runRoles(request: unknown): ReturnType<typeof spawnSync> {
    return spawnSync('/usr/bin/python3', [ROLES], {
      input: JSON.stringify(request),
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    });
  }

  function baseRequest(): Record<string, unknown> {
    return {
      source_roles: [
        fullRole('postgres', {
          rolsuper: true,
          rolinherit: true,
          rolcreaterole: true,
          rolcreatedb: true,
          rolcanlogin: true,
          rolreplication: true,
          rolbypassrls: true,
        }),
        fullRole('admin', { rolcanlogin: true }),
        fullRole('instructor', { rolcanlogin: true }),
      ],
      isolate_roles: ['postgres'],
      source_memberships: [
        {
          member: 'instructor',
          role: 'admin',
          grantor: 'postgres',
          admin_option: false,
          inherit_option: true,
          set_option: true,
        },
      ],
      source_role_settings: [
        {
          role: 'postgres',
          database: null,
          name: 'search_path',
          value: '"$user", public, extensions',
        },
      ],
    };
  }

  it('creates only allowlisted absent roles password-free, replays memberships, applies allowed settings', () => {
    const result = runRoles(baseRequest());

    expect(result.status, result.stderr).toBe(0);
    const sql = result.stdout;
    expect(sql).toContain(
      'CREATE ROLE "admin" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN'
    );
    expect(sql).toContain('CREATE ROLE "instructor" WITH');
    expect(sql).not.toContain('"postgres" WITH'); // present in isolate -> not recreated
    expect(sql).not.toMatch(/PASSWORD/iu); // login-capable bootstrap roles get no password
    expect(sql).toContain('SET ROLE "postgres";');
    expect(sql).toContain(
      'GRANT "admin" TO "instructor" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;'
    );
    expect(sql).toContain('RESET ROLE;');
    expect(sql).toContain(
      'ALTER ROLE "postgres" SET "search_path" TO "$user", public, extensions;'
    );
  });

  it.each([
    [
      'a non-allowlisted source role absent from the isolate',
      (request: any) => {
        request.source_roles.push(fullRole('evil_role'));
      },
      /unexpected missing source role/iu,
    ],
    [
      'a role setting outside the frozen allowlist',
      (request: any) => {
        request.source_role_settings.push({
          role: 'postgres',
          database: null,
          name: 'work_mem',
          value: '999MB',
        });
      },
      /not allowlisted/iu,
    ],
    [
      'a forbidden elevated attribute on a bootstrap role',
      (request: any) => {
        request.source_roles[1].rolsuper = true;
      },
      /privilege allowlist rejects/iu,
    ],
    [
      'an isolate role absent from the source',
      (request: any) => {
        request.isolate_roles.push('mystery_role');
      },
      /unexpected isolate role/iu,
    ],
  ] as const)('fails closed on %s', (_label, mutate, pattern) => {
    const request = baseRequest();
    mutate(request);

    const result = runRoles(request);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(pattern);
  });
});

describe.runIf(REAL_PG17)(
  'Q12 live plan drill-seam consumption on disposable PostgreSQL 17.10',
  () => {
    const docker = (args: string[], input?: string) =>
      spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60_000 });
    let sourceContainer = '';

    // The fake drill mirrors the REAL drill's whole generation preflight, extracted
    // from the drill bytes: the basename ERE (parse_arguments) and the structural
    // validate_generation Python block (4-file set, 0600 modes, checksums
    // schema/generation/files/sha256/size, source-manifest schema). Sourcing the
    // real bytes means a future drill preflight change fails this CI suite, not the
    // live server rehearsal (the reality drift class that produced round-8).
    const REAL_DRILL_SOURCE = readFileSync(
      resolve(REPO_ROOT, 'deploy/postgres/restore-supabase-drill.sh'),
      'utf8'
    );
    function realDrillGenerationEre(): string {
      const m = REAL_DRILL_SOURCE.match(
        /=~ (\^generation-\S+?\$) \]\] \|\| fail 'generation basename is invalid'/u
      );
      if (!m) throw new Error('generation basename regex not found in the drill');
      return m[1];
    }
    function realDrillValidateGenerationPy(): string {
      const fn = REAL_DRILL_SOURCE.indexOf('validate_generation() {');
      const open = REAL_DRILL_SOURCE.indexOf("<<'PY'\n", fn);
      const start = open + "<<'PY'\n".length;
      const end = REAL_DRILL_SOURCE.indexOf('\nPY\n', start);
      if (fn < 0 || open < 0 || end < 0) throw new Error('validate_generation PY block not found');
      return REAL_DRILL_SOURCE.slice(start, end);
    }

    // The exact q12_guard.verify_capability() query the real drill runs during its
    // Q12 activation cleanup (run-restore-cleanup.ts). It cannot exist on a restore
    // of a read-only PRE-cutover source (no q12_guard), which is why the plan must
    // NOT use the drill's Q12 mode. Extracted from the real helper bytes so the fake
    // drill's Q12 branch fails exactly as the server drill did.
    const REAL_CLEANUP_SOURCE = readFileSync(
      resolve(REPO_ROOT, 'deploy/postgres/run-restore-cleanup.ts'),
      'utf8'
    );
    function realVerifyCapabilitySql(): string {
      const m = REAL_CLEANUP_SOURCE.match(/const VERIFY_CAPABILITY_SQL\s*=\s*'([^']+)'/u);
      if (!m) throw new Error('VERIFY_CAPABILITY_SQL not found in run-restore-cleanup.ts');
      return m[1];
    }

    // Minimal Supabase-shaped source that restores faithfully into restore_test:
    // an allowlisted `admin` role owning a table forces the drill's role bootstrap,
    // and a supabase_migrations frontier row + extensions match the structural sha.
    // Same proven Supabase-shaped source as the direct suite (47 public incl. the
    // migration dependencies + admin owning the realtime decoy), so the migrations
    // apply and the restore into restore_test needs the §3 role bootstrap.
    const DRILL_SOURCE_SCHEMA = `
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);
-- MCP-style history: apply-time version timestamps with NO same-named repo file, max ==
-- the reviewed frontier — exactly how this project's production history is generated.
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
  ('20260101093012','mcp_apply_alpha'),
  ('20260515164533','mcp_apply_beta'),
  ('20260704150249','frontier');
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA cron;
CREATE SCHEMA net;
CREATE SCHEMA realtime;
CREATE ROLE admin LOGIN NOINHERIT;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT '{}'::jsonb $fn$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT 'service_role'::text $fn$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $fn$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.courses(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  generation_status text
);
CREATE TABLE public.clarifying_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  question_category text,
  question_priority text,
  status text,
  question_type text,
  suggested_answers jsonb,
  user_answer jsonb,
  answer_source text,
  selected_suggestion_index integer,
  answered_at timestamptz
);
DO $seed$ BEGIN
  FOR i IN 0..43 LOOP EXECUTE format('CREATE TABLE public.public_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
  FOR i IN 0..21 LOOP EXECUTE format('CREATE TABLE auth.auth_table_%s(id bigint PRIMARY KEY)', to_char(i,'FM00')); END LOOP;
END $seed$;
CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.buckets_analytics(id text PRIMARY KEY);
CREATE TABLE storage.objects(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads(id bigint PRIMARY KEY);
CREATE TABLE storage.s3_multipart_uploads_parts(id bigint PRIMARY KEY);
CREATE TABLE realtime.messages(id bigint PRIMARY KEY);
ALTER TABLE realtime.messages OWNER TO admin;
CREATE TABLE cron.job(jobid bigint PRIMARY KEY, schedule text, command text, nodename text, nodeport int, database text, username text, active boolean);
CREATE TABLE cron.job_run_details(runid bigint PRIMARY KEY);
INSERT INTO cron.job SELECT v,'0 * * * *','SELECT '||v,'localhost',5432,'postgres','postgres',true FROM generate_series(1,8) v;
CREATE TABLE net.http_request_queue(id bigint PRIMARY KEY);
CREATE TABLE net.http_response(id bigint PRIMARY KEY);
-- A no-dependent source function the injectMissing drill can DROP from the isolate to
-- simulate a MISSING source object (a function, so it does not change guarded-relation counts).
CREATE FUNCTION public.q12_missing_probe() RETURNS integer LANGUAGE sql IMMUTABLE AS $fn$ SELECT 1 $fn$;
`;

    async function readyPostgres(container: string): Promise<void> {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const logs = docker(['logs', container]);
        const probe = docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'postgres']);
        if (
          probe.status === 0 &&
          `${logs.stdout}${logs.stderr}`.includes(
            'PostgreSQL init process complete; ready for start up.'
          )
        ) {
          return;
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
      }
      throw new Error(`postgres not ready: ${docker(['logs', container]).stderr}`);
    }

    beforeAll(async () => {
      sourceContainer = `mc2-q12-drill-src-${process.pid}-${Date.now()}`;
      const started = docker([
        'run',
        '-d',
        '--rm',
        '--name',
        sourceContainer,
        '-e',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        POSTGRES_IMAGE,
      ]);
      if (started.status !== 0) throw new Error(`drill source run failed: ${started.stderr}`);
      await readyPostgres(sourceContainer);
      const setup = docker(
        ['exec', '-i', sourceContainer, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
        DRILL_SOURCE_SCHEMA
      );
      if (setup.status !== 0) throw new Error(`drill source schema failed: ${setup.stderr}`);
    }, 120_000);

    afterAll(() => {
      if (sourceContainer) docker(['rm', '-f', sourceContainer]);
    });

    function fakeDrill(
      logPath: string,
      opts: { badHandle?: boolean; injectDrift?: boolean; injectMissing?: boolean } = {}
    ): string {
      const dir = mkdtempSync('/tmp/mc2-q12-fakedrill-');
      temporaryDirectories.push(dir);
      const script = join(dir, 'drill.sh');
      writeFileSync(
        script,
        `#!/usr/bin/env bash
set -Eeuo pipefail
d="\${MC2_Q12_PLAN_DOCKER:-/usr/bin/docker}"
{ printf 'argv:%s\\n' "$*"; printf 'handle_env:%s\\n' "$MC2_Q12_RESTORE_PERSIST_HANDLE"; } > ${JSON.stringify(logPath)}
run_id=''; generation=''; mode=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id) run_id="$2"; mode=q12; shift 2;;
    --scheduled-run-id) run_id="$2"; mode=scheduled; shift 2;;
    --generation) generation="$2"; shift 2;;
    --q12-db-capability-file) shift 2;;
    *) shift;;
  esac
done
${
  opts.badHandle
    ? `# Fail before creating any resource, so a malformed handle can never leak one.
printf '{"broken":true}\\n' > "$MC2_Q12_RESTORE_PERSIST_HANDLE"
chmod 0400 "$MC2_Q12_RESTORE_PERSIST_HANDLE"
exit 0`
    : ''
}
# Real drill preflight (extracted from the drill bytes): reject before creating any
# resource, exactly as the server drill validates the generation before restoring.
gbase="\${generation##*/}"
[[ "$gbase" =~ ${realDrillGenerationEre()} ]] || { printf 'generation basename is invalid\\n' >&2; exit 64; }
/usr/bin/python3 - "$generation" "$gbase" "$(id -u)" "$(id -g)" <<'PY'
${realDrillValidateGenerationPy()}
PY
net="mc2-q12-fakedrill-net-$$"; vol="mc2-q12-fakedrill-vol-$$"; c="mc2-q12-fakedrill-$$"
"$d" network create "$net" >/dev/null
"$d" volume create "$vol" >/dev/null
"$d" run -d --name "$c" --network "$net" --mount "type=volume,src=$vol,dst=/var/lib/postgresql/data" -e POSTGRES_PASSWORD=fakedrillpw -p 127.0.0.1::5432 ${JSON.stringify(POSTGRES_IMAGE)} >/dev/null
for i in $(seq 1 300); do "$d" exec "$c" pg_isready -U postgres >/dev/null 2>&1 && "$d" logs "$c" 2>&1 | grep -q "init process complete" && break; sleep 0.2; done
# The real drill creates restore_test with the source database's exact properties;
# replicate the postgres db's default comment so the structural sha matches.
"$d" exec -i "$c" psql -X -U postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE admin LOGIN NOINHERIT;" -c "CREATE DATABASE restore_test;" -c "COMMENT ON DATABASE restore_test IS 'default administrative connection database';" >/dev/null
# The real drill restores the source roles (generation/roles.sql) BEFORE database.dump so the
# schema's GRANTs to the Supabase app roles resolve. Mirror that ordering: idempotently create
# the app roles the source dump may GRANT to, before restoring the schema.
"$d" exec -i "$c" psql -X -U postgres -v ON_ERROR_STOP=1 <<'ROLES' >/dev/null
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
END $roles$;
ROLES
"$d" exec -i "$c" pg_restore -U postgres -d restore_test --no-password --exit-on-error --single-transaction < "$generation/database.dump" >/dev/null
if [[ "$mode" == q12 ]]; then
  # Mirror the real drill's Q12 activation cleanup (run-restore-cleanup.ts): it runs
  # q12_guard.verify_capability() against restore_test, which cannot exist on a
  # guard-less pre-cutover plan restore. Scheduled mode skips this, as the real drill does.
  "$d" exec -i "$c" psql -X -U postgres -d restore_test -v ON_ERROR_STOP=1 -c ${JSON.stringify(realVerifyCapabilitySql())} >/dev/null
fi
${
  opts.injectDrift
    ? `# A delta-neutral EXTRA object ONLY in the isolate (not the source): the completeness
# gate must tolerate + report it, and composition must exclude it.
"$d" exec -i "$c" psql -X -U postgres -d restore_test -v ON_ERROR_STOP=1 -c "CREATE FUNCTION public.q12_drift_probe() RETURNS integer LANGUAGE sql IMMUTABLE AS \\$\\$ SELECT 1 \\$\\$;" >/dev/null`
    : ''
}
${
  opts.injectMissing
    ? `# Drop a SOURCE function from the isolate -> the restore is missing a source object
# (absolutely fatal). The source keeps public.q12_missing_probe (from DRILL_SOURCE_SCHEMA).
"$d" exec -i "$c" psql -X -U postgres -d restore_test -v ON_ERROR_STOP=1 -c "DROP FUNCTION public.q12_missing_probe();" >/dev/null`
    : ''
}
# Mirror the real drill's write-blocking override: the restored DB is left read-only, so the
# plan's migration phase must lift it (excluded from the frozen structural settings hash).
"$d" exec -i "$c" psql -X -U postgres -d restore_test -v ON_ERROR_STOP=1 -c "ALTER DATABASE restore_test SET default_transaction_read_only TO on;" >/dev/null
port=$("$d" port "$c" 5432/tcp | sed -n 's/.*:\\([0-9][0-9]*\\)$/\\1/p')
/usr/bin/python3 -c 'import json,os,sys
h={"schema_version":"megacampus.q12.restore-persist-handle/v1","run_id":sys.argv[1],"container":sys.argv[2],"network":sys.argv[3],"volume":sys.argv[4],"host":"127.0.0.1","port":int(sys.argv[5]),"database":"restore_test","user":"postgres","password":"fakedrillpw"}
open(sys.argv[6],"w").write(json.dumps(h,sort_keys=True)+"\\n")' "$run_id" "$c" "$net" "$vol" "$port" "$MC2_Q12_RESTORE_PERSIST_HANDLE"
chmod 0400 "$MC2_Q12_RESTORE_PERSIST_HANDLE"
`,
        { mode: 0o755 }
      );
      chmodSync(script, 0o755);
      return script;
    }

    function runDrillPlan(
      fixture: PlanFixture,
      drill: string,
      extraEnv: Record<string, string> = {},
      extraArgs: string[] = []
    ) {
      return spawnSync(
        '/usr/bin/python3',
        [
          CORE,
          'plan',
          '--run-id',
          RUN_ID,
          '--release-sha',
          RELEASE_SHA,
          '--db-url-file',
          fixture.dbUrl,
          '--ca-file',
          fixture.ca,
          '--run-root',
          fixture.runRoot,
          ...extraArgs,
        ],
        {
          encoding: 'utf8',
          timeout: 180_000,
          env: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            LC_ALL: 'C',
            LANG: 'C',
            MC2_Q12_PLAN_RESTORE_MODE: 'drill',
            MC2_Q12_PLAN_DRILL: drill,
            MC2_Q12_PLAN_SOURCE_CONTAINER: sourceContainer,
            MC2_Q12_PLAN_MIGRATION_APPLY: applySeamDrill(),
            MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
            ...extraEnv,
          },
        }
      );
    }

    // The apply seam routes to the handle's dbname (restore_test) and bootstraps the
    // Supabase roles the migrations GRANT to (as in the direct-mode seam).
    function applySeamDrill(): string {
      const dir = mkdtempSync('/tmp/mc2-q12-plan-seam-');
      temporaryDirectories.push(dir);
      const script = join(dir, 'apply.sh');
      writeFileSync(
        script,
        `#!/usr/bin/env bash
set -euo pipefail
packet="$1"
c="$MC2_Q12_PLAN_ISOLATE_CONTAINER"
db="\${MC2_Q12_PLAN_ISOLATE_DBNAME:-postgres}"
d="$MC2_Q12_PLAN_DOCKER"
mig="$MC2_Q12_PLAN_REPO_ROOT/packages/course-gen-platform/supabase/migrations"
apply() {
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$mig/$3"
}
"$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" <<'ROLES'
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOLOGIN NOINHERIT; END IF;
END $roles$;
ROLES
case "$packet" in
  base)
    apply 20260711120000 x 20260711120000_document_evidence.sql
    apply 20260711130000 x 20260711130000_document_conflict_auto_answers.sql
    apply 20260711140000 x 20260711140000_document_conflict_side_identity.sql
    ;;
  observability)
    apply 20260711150000 x 20260711150000_document_evidence_observability_index.sql
    apply 20260711151000 x 20260711151000_document_evidence_observability_totals.sql
    ;;
esac
`,
        { mode: 0o755 }
      );
      chmodSync(script, 0o755);
      return script;
    }

    function leftoverFakeDrill(): string[] {
      return docker(['ps', '-a', '--filter', 'name=mc2-q12-fakedrill-', '--format', '{{.Names}}'])
        .stdout.split('\n')
        .filter(Boolean);
    }

    it('invokes the drill in scheduled mode with the persist handle, migrates restore_test through it, and tears everything down', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      const result = runDrillPlan(fixture, fakeDrill(drillLog));

      expect(result.status, result.stderr).toBe(0);
      // The plan restores a guard-less pre-cutover source, so it uses the drill's
      // SCHEDULED mode (no capability, no Q12 activation cleanup) — the Q12 mode
      // would run q12_guard.verify_capability() and fail.
      const log = readFileSync(drillLog, 'utf8');
      expect(log).toContain('--scheduled-run-id');
      expect(log).toContain('--generation');
      expect(log).not.toContain('--q12-db-capability-file');
      expect(log).not.toMatch(/argv:[^\n]*--run-id\b/u);
      expect(log).toMatch(/handle_env:.*restore-persist-handle\.json/u);
      // Catalog emitted from the restore_test capture through the handle.
      const emitted = readFileSync(fixture.catalogPath);
      assertPassesFrozenBarrier(emitted.toString('utf8'));
      const catalog = JSON.parse(emitted.toString('utf8')) as Record<string, any>;
      expect(catalog.guarded_relations).toHaveLength(76);
      expect(catalog.migrations['20260711151000'].relations.map((r: any) => r.name)).toEqual([
        'document_evidence_observability_totals',
      ]);
      // Plan tears down the drill's persisted resources + handle + generation.
      expect(leftoverFakeDrill()).toEqual([]);
      expect(existsSync(join(fixture.runRoot, 'restore-persist-handle.json'))).toBe(false);
    }, 180_000);

    it('fails closed and reclaims resources when the drill publishes a malformed handle', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      const result = runDrillPlan(fixture, fakeDrill(drillLog, { badHandle: true }));

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/persist handle/iu);
      expect(existsSync(fixture.catalogPath)).toBe(false);
      expect(leftoverFakeDrill()).toEqual([]);
    }, 180_000);

    it('tolerates a delta-neutral extra object, reports it, and still emits the catalog (round-15)', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      // The drill manufactures a function ONLY in the isolate (an EXTRA the source lacks),
      // like the image synthesizing default ACLs on restore-created schemas. It is
      // delta-neutral (unchanged across checkpoints), so the plan SUCCEEDS, EXCLUDES it
      // from the composed catalog (composed still == real source), and REPORTS it.
      const result = runDrillPlan(fixture, fakeDrill(drillLog, { injectDrift: true }));

      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(fixture.catalogPath)).toBe(true);
      const plan = JSON.parse(result.stdout) as {
        observed_extra_identities: Array<{ section: string; identity: string }>;
      };
      const extra = plan.observed_extra_identities.find(e =>
        e.identity.includes('q12_drift_probe')
      );
      expect(extra, JSON.stringify(plan.observed_extra_identities)).toBeTruthy();
      expect(extra?.section).toBe('functions');
      // The tolerated extra is named in the run log too.
      expect(result.stderr).toContain('tolerated delta-neutral extra');
      expect(result.stderr).toContain('q12_drift_probe');
      expect(leftoverFakeDrill()).toEqual([]);
    }, 180_000);

    it('--keep-equality-diagnostics preserves the full payloads + diff on a MISSING-object failure (round-12)', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      // The drill DROPS a source function from the isolate -> the restore is missing a
      // source object -> completeness is absolutely fatal, and diagnostics are preserved.
      const result = runDrillPlan(fixture, fakeDrill(drillLog, { injectMissing: true }), {}, [
        '--keep-equality-diagnostics',
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/not object-complete/iu);
      const diagDir = join(fixture.runRoot, 'equality-diagnostics');
      expect(statSync(diagDir).mode & 0o777).toBe(0o700);
      for (const name of [
        'source-structural-payload.json',
        'isolate-structural-payload.json',
        'equality-diff.txt',
      ]) {
        const path = join(diagDir, name);
        expect(existsSync(path), `${name} missing`).toBe(true);
        expect(statSync(path).mode & 0o777).toBe(0o600);
      }
      // The preserved payloads are the real canonical catalogs; the dropped (missing)
      // source function must appear in the SOURCE payload and the full diff.
      const sourcePayload = readFileSync(join(diagDir, 'source-structural-payload.json'), 'utf8');
      expect(sourcePayload).toContain('q12_missing_probe');
      expect(readFileSync(join(diagDir, 'equality-diff.txt'), 'utf8')).toContain(
        'q12_missing_probe'
      );
      expect(existsSync(fixture.catalogPath)).toBe(false);
      expect(leftoverFakeDrill()).toEqual([]);
    }, 180_000);

    const MIG_DIR = resolve(REPO_ROOT, 'packages/course-gen-platform/supabase/migrations');
    const BASE_FILES = [
      '20260711120000_document_evidence.sql',
      '20260711130000_document_conflict_auto_answers.sql',
      '20260711140000_document_conflict_side_identity.sql',
    ];
    const OBS_FILES = [
      '20260711150000_document_evidence_observability_index.sql',
      '20260711151000_document_evidence_observability_totals.sql',
    ];
    function applyFilesTo(container: string, files: string[]): void {
      for (const file of files) {
        const sql = readFileSync(join(MIG_DIR, file), 'utf8');
        const res = docker(
          [
            'exec',
            '-i',
            container,
            'psql',
            '-X',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'postgres',
            '-d',
            'postgres',
          ],
          sql
        );
        if (res.status !== 0) throw new Error(`apply ${file} failed: ${res.stderr}`);
      }
    }
    function structuralSha(container: string): string {
      const res = spawnSync(
        '/usr/bin/python3',
        [CAPTURE, '--container', container, '--dbname', 'postgres'],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            LC_ALL: 'C',
            LANG: 'C',
            MC2_Q12_PLAN_DOCKER: '/usr/bin/docker',
          },
        }
      );
      if (res.status !== 0) throw new Error(`source capture failed: ${res.stderr}`);
      return (JSON.parse(res.stdout) as { structural_sha256: string }).structural_sha256;
    }

    it('composed prediction equals the real post-migration SOURCE hash despite dump-round-trip renormalization (round-13)', async () => {
      // Dedicated disposable source seeded with the Supabase-shaped schema, the roles the
      // migrations GRANT to, AND a check constraint written so PG 17.6 renormalizes it on
      // dump/restore (the ruling's check_processing_method class) — so a naive raw-isolate
      // prediction of a pre-existing object would NOT match the live post-migration hash.
      const container = `mc2-q13-src-${process.pid}-${Date.now()}`;
      const started = docker([
        'run',
        '-d',
        '--name',
        container,
        '-e',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        POSTGRES_IMAGE,
      ]);
      if (started.status !== 0) throw new Error(`q13 source run failed: ${started.stderr}`);
      try {
        await readyPostgres(container);
        // The check constraint attaches to an EXISTING table (no new guarded relation, so
        // the frozen inventory_counts stay intact) and is written so PG 17.6 renormalizes it
        // on dump/restore (the ruling's check_processing_method class).
        const seed = `${DRILL_SOURCE_SCHEMA}
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
ALTER TABLE public.courses ADD CONSTRAINT check_processing_method
  CHECK (generation_status = ANY (ARRAY['full_text'::varchar, 'hierarchical'::varchar]::text[]));
-- round-14: a DROPPED-column attnum GAP on a pre-existing table the migrations never
-- touch, plus a comment on a column AFTER the gap. In the source these attnums have a
-- hole; pg_restore compacts them in the isolate, so dump-UNSTABLE identity keys
-- (column position, comment subobject_id) would false-positive object-completeness.
ALTER TABLE public.organizations ADD COLUMN q14_dropme text;
ALTER TABLE public.organizations DROP COLUMN q14_dropme;
ALTER TABLE public.organizations ADD COLUMN q14_post_gap text;
COMMENT ON COLUMN public.organizations.q14_post_gap IS 'q14 post-gap column comment';`;
        const setup = docker(
          ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
          seed
        );
        if (setup.status !== 0) throw new Error(`q13 source seed failed: ${setup.stderr}`);

        const fixture = planFixture();
        const drillLog = join(fixture.runRoot, 'drill-invocation.log');
        const result = runDrillPlan(fixture, fakeDrill(drillLog), {
          MC2_Q12_PLAN_SOURCE_CONTAINER: container,
        });
        expect(result.status, result.stderr).toBe(0);
        const catalog = JSON.parse(readFileSync(fixture.catalogPath, 'utf8')) as {
          migrations: Record<string, { catalog_sha256: string }>;
        };

        // Apply the SAME five migration files to the SOURCE itself (the live window),
        // and compute its REAL post-migration structural hash at each checkpoint.
        applyFilesTo(container, BASE_FILES);
        const realBase = structuralSha(container);
        applyFilesTo(container, OBS_FILES);
        const realObs = structuralSha(container);

        expect(catalog.migrations['20260711140000'].catalog_sha256).toBe(realBase);
        expect(catalog.migrations['20260711151000'].catalog_sha256).toBe(realObs);
        expect(leftoverFakeDrill()).toEqual([]);
      } finally {
        docker(['rm', '-f', container]);
      }
    }, 180_000);

    it('composed prediction equals the real post-migration SOURCE hash for an allowlisted MODIFIED pre-existing function (round-19)', async () => {
      // Same disposable-source proof as round-13, but auto_answer_questions_atomic(p_course_id
      // uuid) already EXISTS in the source before the window runs, seeded from the exact
      // prod-producing repo file (history 20260127143610 /
      // 20260127200000_auto_answer_questions_atomic_rpc.sql) — chosen over hand-transcribed DDL
      // so the seed stays byte-faithful to the object prod actually has. 20260711120000 and
      // 20260711130000 both CREATE OR REPLACE it (120000 re-GRANTs EXECUTE), so it is an
      // in-place MODIFICATION of a pre-existing entry — the exact rehearsal-12 fail-closed stop.
      // The frozen MIGRATION_MODIFIED_IDENTITY_ALLOWLIST must let the composer take the isolate
      // POST render, and composed == real must stay byte-EQUAL (empirical proof that CREATE OR
      // REPLACE renders identically on both sides on the pinned PG 17.6). CI missed this before
      // because the source seed lacked the function, so the replace was additive.
      const container = `mc2-q19-src-${process.pid}-${Date.now()}`;
      const started = docker([
        'run',
        '-d',
        '--name',
        container,
        '-e',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        POSTGRES_IMAGE,
      ]);
      if (started.status !== 0) throw new Error(`q19 source run failed: ${started.stderr}`);
      try {
        await readyPostgres(container);
        const seed = `${DRILL_SOURCE_SCHEMA}
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
ALTER TABLE public.courses ADD CONSTRAINT check_processing_method
  CHECK (generation_status = ANY (ARRAY['full_text'::varchar, 'hierarchical'::varchar]::text[]));`;
        const setup = docker(
          ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
          seed
        );
        if (setup.status !== 0) throw new Error(`q19 source seed failed: ${setup.stderr}`);
        // Pre-create the OLD function so the window MODIFIES (not adds) it. Roles the GRANTs
        // target already exist from the seed above.
        const oldRpc = readFileSync(
          join(MIG_DIR, '20260127200000_auto_answer_questions_atomic_rpc.sql'),
          'utf8'
        );
        const seedFn = docker(
          ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
          oldRpc
        );
        if (seedFn.status !== 0) throw new Error(`q19 old-function seed failed: ${seedFn.stderr}`);

        const fixture = planFixture();
        const drillLog = join(fixture.runRoot, 'drill-invocation.log');
        const result = runDrillPlan(fixture, fakeDrill(drillLog), {
          MC2_Q12_PLAN_SOURCE_CONTAINER: container,
        });
        // Without the allowlist this fails closed with the rehearsal-12 message; with it the
        // plan succeeds and the composed checkpoint hashes must equal the real ones.
        expect(result.status, result.stderr).toBe(0);
        const catalog = JSON.parse(readFileSync(fixture.catalogPath, 'utf8')) as {
          migrations: Record<string, { catalog_sha256: string }>;
        };

        applyFilesTo(container, BASE_FILES);
        const realBase = structuralSha(container);
        applyFilesTo(container, OBS_FILES);
        const realObs = structuralSha(container);

        expect(catalog.migrations['20260711140000'].catalog_sha256).toBe(realBase);
        expect(catalog.migrations['20260711151000'].catalog_sha256).toBe(realObs);
        expect(leftoverFakeDrill()).toEqual([]);
      } finally {
        docker(['rm', '-f', container]);
      }
    }, 180_000);

    function applySeamModifyPreexisting(): string {
      const dir = mkdtempSync('/tmp/mc2-q12-plan-seam-');
      temporaryDirectories.push(dir);
      const script = join(dir, 'apply.sh');
      writeFileSync(
        script,
        `#!/usr/bin/env bash
set -euo pipefail
packet="$1"
c="$MC2_Q12_PLAN_ISOLATE_CONTAINER"
db="\${MC2_Q12_PLAN_ISOLATE_DBNAME:-postgres}"
d="$MC2_Q12_PLAN_DOCKER"
if [[ "$packet" == base ]]; then
  # Modify a PRE-EXISTING column (courses.generation_status default) in the isolate —
  # a non-additive delta that must hard-stop (unpredictable live form).
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -c "ALTER TABLE public.courses ALTER COLUMN generation_status SET DEFAULT 'q13-modified';"
fi
`,
        { mode: 0o755 }
      );
      chmodSync(script, 0o755);
      return script;
    }

    it('hard-stops when an in-isolate migration MODIFIES a pre-existing entry (round-13 negative)', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      const result = runDrillPlan(fixture, fakeDrill(drillLog), {
        MC2_Q12_PLAN_MIGRATION_APPLY: applySeamModifyPreexisting(),
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/non-additive|modified a pre-existing/iu);
      expect(result.stderr).toMatch(/\[columns\]/u);
      expect(existsSync(fixture.catalogPath)).toBe(false);
      expect(leftoverFakeDrill()).toEqual([]);
    }, 180_000);

    it('fails closed before restore when the snapshot coordinator yields a malformed id', () => {
      const fixture = planFixture();
      const drillLog = join(fixture.runRoot, 'drill-invocation.log');

      const result = runDrillPlan(fixture, fakeDrill(drillLog), {
        MC2_Q12_PLAN_FAULT: 'snapshot',
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/invalid snapshot|snapshot coordinator/iu);
      // The drill is never invoked, so no catalog and no drill resource exists.
      expect(existsSync(fixture.catalogPath)).toBe(false);
      expect(existsSync(drillLog)).toBe(false);
      expect(leftoverFakeDrill()).toEqual([]);
    }, 180_000);
  }
);

describe('Q12 plan production seam lockdown (P2-1)', () => {
  const PROD_RUN_ROOT = '/opt/megacampus/backups/q12/123e4567-e89b-42d3-a456-426614174000';
  const SEAMS = [
    'MC2_Q12_PLAN_RESTORE_MODE',
    'MC2_Q12_PLAN_RESTORE_IMAGE',
    'MC2_Q12_PLAN_SOURCE_CONTAINER',
    'MC2_Q12_PLAN_MIGRATION_APPLY',
    'MC2_Q12_PLAN_DRILL',
    'MC2_Q12_PLAN_FAULT',
    'MC2_Q12_PLAN_PG_DUMP',
    'MC2_Q12_PLAN_PG_DUMPALL',
    'MC2_Q12_PLAN_PSQL',
    'MC2_Q12_PLAN_DOCKER',
  ] as const;

  function runGuard(
    runRoot: string,
    extraEnv: Record<string, string>
  ): ReturnType<typeof spawnSync> {
    const script = `import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
try:
    core.assert_production_seam_lockdown(pathlib.Path(sys.argv[1]))
    print('OK')
except core.LifecycleError as error:
    sys.stderr.write(str(error) + '\\n'); sys.exit(3)`;
    return spawnSync('/usr/bin/python3', ['-c', script, runRoot], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', ...extraEnv },
    });
  }

  it('proceeds in production shape with a clean environment', () => {
    const result = runGuard(PROD_RUN_ROOT, {});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK');
  });

  it.each(SEAMS)('fails closed in production shape when %s is set', seam => {
    const result = runGuard(PROD_RUN_ROOT, { [seam]: 'anything' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(seam);
    expect(result.stderr).toMatch(/not permitted in a production plan run/iu);
  });

  it('allows test seams with an explicit /tmp/mc2-q12-plan-* run root', () => {
    const result = runGuard('/tmp/mc2-q12-plan-abc', { MC2_Q12_PLAN_FAULT: 'equality' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK');
  });
});

describe.runIf(RUN_REAL_CONTROLLER)('Q12 plan persist-handle write/read binding (P2-2)', () => {
  const RESTORE = resolve(REPO_ROOT, 'deploy/postgres/restore-supabase-drill.sh');
  const HANDLE_RUN_ID = '123e4567-e89b-42d3-a456-426614174000';

  // The exact write_persist_handle() function extracted from the real drill, so a
  // future drill field change fails this test instead of the live window.
  function drillWritePersistHandle(): string {
    const source = readFileSync(RESTORE, 'utf8');
    const start = source.indexOf('write_persist_handle() {');
    const terminator = '\nPY\n}';
    const end = source.indexOf(terminator, start);
    if (start < 0 || end < 0) throw new Error('write_persist_handle not found in the drill');
    return source.slice(start, end + terminator.length);
  }

  function writeRealHandle(handlePath: string): void {
    const harness = `set -Eeuo pipefail
PERSIST_HANDLE="$1"
CONTAINER_ID="$2"
NETWORK_ID="$3"
VOLUME_NAME="$4"
RUN_ID="$5"
${drillWritePersistHandle()}
write_persist_handle "$6" "$7"`;
    const result = spawnSync(
      '/usr/bin/bash',
      [
        '-c',
        harness,
        'h',
        handlePath,
        'mc2-c',
        'mc2-net',
        'mc2-vol',
        HANDLE_RUN_ID,
        '54329',
        'pw123',
      ],
      { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } }
    );
    if (result.status !== 0) throw new Error(`drill write_persist_handle failed: ${result.stderr}`);
  }

  function readHandle(handlePath: string): ReturnType<typeof spawnSync> {
    const script = `import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
handle = core.LivePlanExecutor()._read_handle(pathlib.Path(sys.argv[1]), sys.argv[2])
print('ACCEPT ' + handle['container'] + ' ' + handle['database'])`;
    return spawnSync('/usr/bin/python3', ['-c', script, handlePath, HANDLE_RUN_ID], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
    });
  }

  it('the real _read_handle accepts the real drill write_persist_handle output', () => {
    const dir = mkdtempSync('/tmp/mc2-q12-plan-');
    temporaryDirectories.push(dir);
    chmodSync(dir, 0o700);
    const handlePath = join(dir, 'restore-persist-handle.json');
    writeRealHandle(handlePath);

    const result = readHandle(handlePath);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('ACCEPT mc2-c restore_test');
  });

  it('the real _read_handle rejects a handle with a dropped field', () => {
    const dir = mkdtempSync('/tmp/mc2-q12-plan-');
    temporaryDirectories.push(dir);
    chmodSync(dir, 0o700);
    const handlePath = join(dir, 'restore-persist-handle.json');
    writeRealHandle(handlePath);
    const handle = JSON.parse(readFileSync(handlePath, 'utf8')) as Record<string, unknown>;
    delete handle.volume;
    chmodSync(handlePath, 0o600);
    writeFileSync(handlePath, `${JSON.stringify(handle, Object.keys(handle).sort())}\n`, {
      mode: 0o400,
    });
    chmodSync(handlePath, 0o400);

    const result = readHandle(handlePath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/persist handle/iu);
  });
});

describe.runIf(RUN_REAL_CONTROLLER)('Q12 plan drill generation contract (round-8)', () => {
  const RESTORE_DRILL = resolve(REPO_ROOT, 'deploy/postgres/restore-supabase-drill.sh');
  const GEN_RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
  const PY_ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

  // The exact generation-basename ERE the real drill enforces
  // (restore-supabase-drill.sh parse_arguments), extracted from the drill bytes so
  // a future format change fails CI, not the server rehearsal.
  function realDrillGenerationRegex(): string {
    const src = readFileSync(RESTORE_DRILL, 'utf8');
    const m = src.match(
      /=~ (\^generation-\S+?\$) \]\] \|\| fail 'generation basename is invalid'/u
    );
    if (!m) throw new Error('generation basename regex not found in the drill');
    return m[1];
  }

  // The real drill's structural validate_generation Python block (4-file set, 0600
  // modes, checksums schema/generation/files/sha256/size, source-manifest schema),
  // extracted verbatim so this contract and the fake drill enforce the identical
  // set the server drill does.
  function realDrillValidatePy(): string {
    const src = readFileSync(RESTORE_DRILL, 'utf8');
    const fn = src.indexOf('validate_generation() {');
    const open = src.indexOf("<<'PY'\n", fn);
    const start = open + "<<'PY'\n".length;
    const end = src.indexOf('\nPY\n', start);
    if (fn < 0 || open < 0 || end < 0) throw new Error('validate_generation PY block not found');
    return src.slice(start, end);
  }

  function loadCore(body: string): string {
    return `import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
${body}`;
  }

  function generationDirname(runId: string): string {
    const res = spawnSync(
      '/usr/bin/python3',
      ['-c', loadCore('print(core.LivePlanExecutor()._generation_dirname(sys.argv[1]))'), runId],
      { encoding: 'utf8', env: PY_ENV }
    );
    if (res.status !== 0) throw new Error(`_generation_dirname failed: ${res.stderr}`);
    return res.stdout.trim();
  }

  function writeChecksums(dir: string): void {
    const res = spawnSync(
      '/usr/bin/python3',
      ['-c', loadCore('core.LivePlanExecutor()._write_checksums(pathlib.Path(sys.argv[1]))'), dir],
      { encoding: 'utf8', env: PY_ENV }
    );
    if (res.status !== 0) throw new Error(`_write_checksums failed: ${res.stderr}`);
  }

  function runDrillPreflight(dir: string, basename: string): ReturnType<typeof spawnSync> {
    return spawnSync(
      '/usr/bin/python3',
      ['-', dir, basename, String(process.getuid?.() ?? 0), String(process.getgid?.() ?? 0)],
      { encoding: 'utf8', input: realDrillValidatePy(), env: PY_ENV }
    );
  }

  function buildGeneration(basename: string): string {
    const parent = mkdtempSync('/tmp/mc2-q12-plan-genwork-');
    temporaryDirectories.push(parent);
    const dir = join(parent, basename);
    mkdirSync(dir, 0o700);
    for (const [name, body] of [
      ['database.dump', 'PGDMP-synthetic\n'],
      ['roles.sql', '-- roles\n'],
      [
        'source-manifest.json',
        `${JSON.stringify({ schema: 'megacampus.supabase-source-manifest/v1' })}\n`,
      ],
    ]) {
      writeFileSync(join(dir, name), body, { mode: 0o600 });
      chmodSync(join(dir, name), 0o600);
    }
    return dir;
  }

  it('the real drill basename regex rejects the pre-fix hex basename and accepts the timestamped-uuid form (rehearsal reproduction)', () => {
    const re = new RegExp(realDrillGenerationRegex(), 'u');
    // Exactly the pre-fix shape that fail-closed the server rehearsal.
    expect(re.test('generation-0123456789abcdef')).toBe(false);
    expect(re.test(`generation-20260716T120000Z-${GEN_RUN_ID}`)).toBe(true);
  });

  it('_generation_dirname emits a basename the real drill preflight accepts', () => {
    expect(generationDirname(GEN_RUN_ID)).toMatch(new RegExp(realDrillGenerationRegex(), 'u'));
  });

  it('_write_checksums records the generation basename so the real drill validate_generation accepts it', () => {
    const basename = `generation-20260716T120000Z-${GEN_RUN_ID}`;
    const dir = buildGeneration(basename);
    writeChecksums(dir);

    const manifest = JSON.parse(readFileSync(join(dir, 'checksums.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest.schema).toBe('megacampus.supabase-backup-checksums/v1');
    expect(manifest.generation).toBe(basename);

    const preflight = runDrillPreflight(dir, basename);
    expect(preflight.status, preflight.stderr).toBe(0);
  });

  function runFaultPlan(runRoot: string): ReturnType<typeof spawnSync> {
    const creds = mkdtempSync('/tmp/mc2-q12-plan-creds-');
    temporaryDirectories.push(creds);
    const dbUrl = join(creds, 'supabase_db_url');
    const ca = join(creds, 'prod-ca.crt');
    writeFileSync(dbUrl, 'postgresql://synthetic\n', { mode: 0o600 });
    chmodSync(dbUrl, 0o600);
    writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
    chmodSync(ca, 0o644);
    return spawnSync('/usr/bin/python3', [RUNNER], {
      input: JSON.stringify({
        run_id: GEN_RUN_ID,
        release_sha: RELEASE_SHA,
        db_url_file: dbUrl,
        ca_file: ca,
        run_root: runRoot,
        evidence: {},
        capture_fault: 'synthetic pre-emission failure',
      }),
      encoding: 'utf8',
      env: PY_ENV,
    });
  }

  it('removes a run dir it created when the run fails before emitting the catalog (item-4)', () => {
    const runRoot = `/tmp/mc2-q12-plan-${GEN_RUN_ID}-created`;
    rmSync(runRoot, { recursive: true, force: true });
    const res = runFaultPlan(runRoot);
    expect(res.status).not.toBe(0);
    expect(existsSync(runRoot)).toBe(false);
  });

  it('preserves a pre-existing run dir on failure (item-4)', () => {
    const runRoot = mkdtempSync('/tmp/mc2-q12-plan-');
    temporaryDirectories.push(runRoot);
    chmodSync(runRoot, 0o700);
    const res = runFaultPlan(runRoot);
    expect(res.status).not.toBe(0);
    expect(existsSync(runRoot)).toBe(true);
  });
});

describe('Q12 plan drill failure diagnostics (round-9)', () => {
  const CORE_PATH = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
  const PY_ENV9 = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

  function drillFailureDetail(
    returncode: number,
    stdoutLog: string,
    stderrLog: string
  ): ReturnType<typeof spawnSync> {
    const script = `import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE_PATH)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
detail = core.LivePlanExecutor()._drill_failure_detail(
    int(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
)
sys.stdout.write(detail)`;
    return spawnSync('/usr/bin/python3', ['-c', script, String(returncode), stdoutLog, stderrLog], {
      encoding: 'utf8',
      env: PY_ENV9,
    });
  }

  it('surfaces labeled stdout AND stderr tails and scrubs secret shapes', () => {
    const dir = mkdtempSync('/tmp/mc2-q12-plan-diag-');
    temporaryDirectories.push(dir);
    const stdoutLog = join(dir, 'drill-stdout.log');
    const stderrLog = join(dir, 'drill-stderr.log');
    const hex = 'a'.repeat(64);
    // stderr may be empty (the exact rehearsal symptom); the reason is on stdout.
    writeFileSync(stderrLog, '', { mode: 0o600 });
    writeFileSync(
      stdoutLog,
      [
        'connecting postgresql://postgres:supersecretpw@127.0.0.1:5432/postgres',
        `restore token ${hex}`,
        'password=hunter2 in service file',
        'ERROR:  schema "q12_guard" does not exist',
      ].join('\n'),
      { mode: 0o600 }
    );

    const res = drillFailureDetail(42, stdoutLog, stderrLog);

    expect(res.status, res.stderr).toBe(0);
    const detail = res.stdout;
    expect(detail).toContain('exit 42');
    expect(detail).toContain('drill stderr (last 60 lines)');
    expect(detail).toContain('drill stdout (last 60 lines)');
    // The empty stderr is shown as such, and the real reason (on stdout) survives.
    expect(detail).toContain('<empty>');
    expect(detail).toContain('schema "q12_guard" does not exist');
    // Secrets scrubbed.
    expect(detail).not.toContain('supersecretpw');
    expect(detail).not.toContain('hunter2');
    expect(detail).not.toContain(hex);
    expect(detail).toContain('***');
  });
});

describe('Q12 structural equality diff engine (round-11)', () => {
  const CORE_PATH = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
  const PY_ENV11 = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

  function structuralDiff(source: unknown, isolate: unknown): string {
    const script = `import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE_PATH)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
sys.stdout.write(core._structural_catalog_diff(json.loads(sys.argv[1]), json.loads(sys.argv[2])))`;
    const res = spawnSync(
      '/usr/bin/python3',
      ['-c', script, JSON.stringify(source), JSON.stringify(isolate)],
      { encoding: 'utf8', env: PY_ENV11 }
    );
    if (res.status !== 0) throw new Error(`_structural_catalog_diff failed: ${res.stderr}`);
    return res.stdout;
  }

  it('names per-section added/removed/changed identifiers with side value digests, statements as sha only', () => {
    const source = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      database: { name: 'postgres', owner: 'admin', encoding: 'UTF8' },
      extensions: [{ name: 'pgcrypto', version: '1.3', schema: 'extensions' }],
      functions: [
        { schema: 'public', name: 'f', identity: 'f()' },
        { schema: 'auth', name: 'jwt', identity: 'jwt()' },
      ],
      migration_history: [
        { version: '20260704150249', name: 'frontier', statements: ['CREATE X'] },
      ],
    };
    const isolate = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      // extension version bumped by the image (changed), not add/remove.
      database: { name: 'postgres', owner: 'postgres', encoding: 'UTF8' },
      extensions: [{ name: 'pgcrypto', version: '1.4', schema: 'extensions' }],
      // auth.jwt removed; a new probe added.
      functions: [
        { schema: 'public', name: 'f', identity: 'f()' },
        { schema: 'public', name: 'q12_drift_probe', identity: 'q12_drift_probe()' },
      ],
      migration_history: [
        { version: '20260704150249', name: 'frontier', statements: ['CREATE Y'] },
      ],
    };

    const diff = structuralDiff(source, isolate);

    expect(diff).toMatch(/\[extensions\][^\n]*~1/u);
    expect(diff).toContain('name=pgcrypto');
    expect(diff).toMatch(/\[functions\][^\n]*\+1[^\n]*-1/u);
    expect(diff).toContain('name=q12_drift_probe');
    expect(diff).toContain('name=jwt');
    expect(diff).toMatch(/\[database\]/u);
    expect(diff).toContain('owner');
    expect(diff).toMatch(/\[migration_history\][^\n]*~1/u);
    expect(diff).toContain('version=20260704150249');
    // Statements are digested, never shown verbatim.
    expect(diff).not.toContain('CREATE X');
    expect(diff).not.toContain('CREATE Y');
  });

  it('scrubs secret shapes in identifiers and bounds output', () => {
    const hex = 'b'.repeat(64);
    const source = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      relations: Array.from({ length: 50 }, (_, i) => ({ schema: 'public', name: `t${i}` })),
      comments: [{ object_type: 'table', schema: 'public', identity: `secret_${hex}` }],
    };
    const isolate = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      relations: [],
      comments: [],
    };

    const diff = structuralDiff(source, isolate);

    // The raw 64-hex secret shape must not survive into the diagnostic.
    expect(diff).not.toContain(hex);
    expect(diff).toContain('***');
    // Bounded: 50 removed relations must not print 50 identifier lines.
    expect(diff).toMatch(/\[relations\][^\n]*-50/u);
    const relationLines = diff
      .split('\n')
      .filter(l => l.trimStart().startsWith('- schema=public|name=t'));
    expect(relationLines.length).toBeLessThanOrEqual(10);
  });
});

describe('Q12 equality diagnostics preservation (round-12)', () => {
  const CORE12 = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
  const RUN_ID12 = '123e4567-e89b-42d3-a456-426614174000';
  const PY_ENV12 = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

  it('emits the FULL unbounded per-entry diff when max_ids/max_lines are None', () => {
    const source = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      relations: Array.from({ length: 50 }, (_, i) => ({ schema: 'public', name: `t${i}` })),
    };
    const isolate = {
      schema_version: 'megacampus.q12.structural-catalog-payload/v1',
      relations: [],
    };
    const script = `import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE12)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
sys.stdout.write(core._structural_catalog_diff(json.loads(sys.argv[1]), json.loads(sys.argv[2]), max_ids=None, max_lines=None))`;
    const res = spawnSync(
      '/usr/bin/python3',
      ['-c', script, JSON.stringify(source), JSON.stringify(isolate)],
      { encoding: 'utf8', env: PY_ENV12 }
    );

    expect(res.status, res.stderr).toBe(0);
    const relationLines = res.stdout
      .split('\n')
      .filter(l => l.trimStart().startsWith('- schema=public|name=t'));
    // Unbounded: all 50 removed relations are listed, not capped at 10.
    expect(relationLines.length).toBe(50);
  });

  function runDiagFaultPlan(runRoot: string): ReturnType<typeof spawnSync> {
    const creds = mkdtempSync('/tmp/mc2-q12-plan-creds-');
    temporaryDirectories.push(creds);
    const dbUrl = join(creds, 'supabase_db_url');
    const ca = join(creds, 'prod-ca.crt');
    writeFileSync(dbUrl, 'postgresql://synthetic\n', { mode: 0o600 });
    chmodSync(dbUrl, 0o600);
    writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
    chmodSync(ca, 0o644);
    return spawnSync('/usr/bin/python3', [RUNNER], {
      input: JSON.stringify({
        run_id: RUN_ID12,
        release_sha: RELEASE_SHA,
        db_url_file: dbUrl,
        ca_file: ca,
        run_root: runRoot,
        evidence: {},
        write_diag: true,
        capture_fault: 'synthetic equality mismatch',
      }),
      encoding: 'utf8',
      env: PY_ENV12,
    });
  }

  it('preserves a created run dir on failure when equality diagnostics were written', () => {
    const runRoot = `/tmp/mc2-q12-plan-${RUN_ID12}-diag`;
    rmSync(runRoot, { recursive: true, force: true });
    const res = runDiagFaultPlan(runRoot);
    temporaryDirectories.push(runRoot);
    expect(res.status).not.toBe(0);
    // The run dir it created is PRESERVED (not removed) because diagnostics live there.
    expect(existsSync(runRoot)).toBe(true);
    expect(existsSync(join(runRoot, 'equality-diagnostics', 'equality-diff.txt'))).toBe(true);
  });
});

describe('Q12 delta-composed prediction engine (round-13)', () => {
  const CORE13 = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
  const PY_ENV13 = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

  // Call a module function with JSON args; returns {status, out(parsed|null), err}.
  function callCore(fn: string, args: unknown[]): { status: number; out: unknown; err: string } {
    const script = `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('core', ${JSON.stringify(CORE13)})
core = importlib.util.module_from_spec(spec); sys.modules['core'] = core; spec.loader.exec_module(core)
try:
    result = getattr(core, sys.argv[1])(*[json.loads(a) for a in sys.argv[2:]])
    sys.stdout.write('' if result is None else json.dumps(result))
except core.LifecycleError as error:
    sys.stderr.write('LIFECYCLE: ' + str(error)); sys.exit(7)`;
    const res = spawnSync(
      '/usr/bin/python3',
      ['-c', script, fn, ...args.map(a => JSON.stringify(a))],
      {
        encoding: 'utf8',
        env: PY_ENV13,
      }
    );
    return {
      status: res.status ?? -1,
      out: res.stdout ? JSON.parse(res.stdout) : null,
      err: res.stderr,
    };
  }

  const SV = 'megacampus.q12.structural-catalog-payload/v1';
  // A pre-existing constraint whose stored tree deparses differently after restore
  // (the check_processing_method renormalization class), plus a fresh one.
  const preExistingLive = {
    schema: 'public',
    name: 'check_processing_method',
    relation_schema: 'public',
    relation_name: 't',
    definition:
      "= ANY (ARRAY['full_text'::character varying, 'hierarchical'::character varying]::text[])",
  };
  const preExistingIsolate = {
    schema: 'public',
    name: 'check_processing_method',
    relation_schema: 'public',
    relation_name: 't',
    definition:
      "= ANY (ARRAY['full_text'::character varying::text, 'hierarchical'::character varying::text])",
  };
  const freshEntry = {
    schema: 'public',
    name: 'fresh_ck',
    relation_schema: 'public',
    relation_name: 't',
    definition: 'CHECK (x > 0)',
  };

  it('_compose_predicted_payload takes pre-existing content from the SOURCE and fresh from the isolate, in isolate order', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres', comment: 'live' },
      constraints: [preExistingLive],
    };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres', comment: 'iso' },
      constraints: [preExistingIsolate],
    };
    const iCheck = {
      schema_version: SV,
      database: { name: 'postgres', comment: 'iso' },
      constraints: [preExistingIsolate, freshEntry],
    };

    const composed = callCore('_compose_predicted_payload', [source, iPre, iCheck]) as {
      out: {
        database: { comment: string };
        constraints: Array<{ name: string; definition: string }>;
      };
    };
    const payload = composed.out as unknown as {
      database: { comment: string };
      constraints: Array<{ name: string; definition: string }>;
    };

    // pre-existing → SOURCE (live) content, still first (isolate order); fresh → isolate content.
    expect(payload.constraints[0].name).toBe('check_processing_method');
    expect(payload.constraints[0].definition).toBe(preExistingLive.definition);
    expect(payload.constraints[1].name).toBe('fresh_ck');
    // singleton database is the pre-existing SOURCE object.
    expect(payload.database.comment).toBe('live');
  });

  it('_check_restore_completeness hard-stops when the restore is missing a source object', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingLive],
    };
    const iPre = { schema_version: SV, database: { name: 'postgres' }, constraints: [] };
    const res = callCore('_check_restore_completeness', [source, iPre]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[constraints\]/u);
    expect(res.err).toContain('check_processing_method');
  });

  it('_compose_predicted_payload hard-stops when a migration MODIFIES a pre-existing entry (non-additive)', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingLive],
    };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingIsolate],
    };
    // i_check ALTERs the pre-existing constraint (definition changed vs i_pre).
    const altered = { ...preExistingIsolate, definition: 'CHECK (different)' };
    const iCheck = { schema_version: SV, database: { name: 'postgres' }, constraints: [altered] };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[constraints\]/u);
    expect(res.err).toMatch(/modified|removed|non-additive/iu);
  });

  it('_compose_predicted_payload hard-stops when a migration REMOVES a pre-existing entry', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingLive],
    };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingIsolate],
    };
    const iCheck = { schema_version: SV, database: { name: 'postgres' }, constraints: [] };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[constraints\]/u);
  });

  // round-14: completeness identity must ignore dump-UNSTABLE fields. Production tables
  // carry dropped-column gaps in the source; pg_restore compacts attnums, so the SAME
  // column has a different `position` (and a column comment a different `subobject_id`)
  // in the isolate. Those must NOT be read as missing/extra objects.
  it('object-completeness tolerates a dump-unstable column position (round-14)', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      columns: [
        {
          schema: 'auth',
          relation: 'oauth_clients',
          name: 'client_name',
          position: 7,
          type: 'text',
        },
      ],
    };
    const isolate = {
      schema_version: SV,
      database: { name: 'postgres' },
      columns: [
        {
          schema: 'auth',
          relation: 'oauth_clients',
          name: 'client_name',
          position: 6,
          type: 'text',
        },
      ],
    };
    const res = callCore('_check_restore_completeness', [source, isolate]);
    expect(res.status, res.err).toBe(0);
  });

  it('object-completeness tolerates a dump-unstable column-comment subobject_id (round-14)', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      comments: [
        {
          object_type: 'table column',
          schema: 'auth',
          name: 'oauth_clients',
          identity: 'auth.oauth_clients.client_name',
          subobject_id: 7,
          comment: 'x',
        },
      ],
    };
    const isolate = {
      schema_version: SV,
      database: { name: 'postgres' },
      comments: [
        {
          object_type: 'table column',
          schema: 'auth',
          name: 'oauth_clients',
          identity: 'auth.oauth_clients.client_name',
          subobject_id: 6,
          comment: 'x',
        },
      ],
    };
    const res = callCore('_check_restore_completeness', [source, isolate]);
    expect(res.status, res.err).toBe(0);
  });

  it('_compose_predicted_payload matches a pre-existing column by name across a position shift (round-14)', () => {
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      columns: [{ schema: 'auth', relation: 'oauth_clients', name: 'client_name', position: 7 }],
    };
    // isolate carries the compacted attnum; content differs only in position.
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      columns: [{ schema: 'auth', relation: 'oauth_clients', name: 'client_name', position: 6 }],
    };
    const composed = callCore('_compose_predicted_payload', [source, iPre, iPre]) as {
      out: { columns: Array<{ name: string; position: number }> };
    };
    // pre-existing column resolved to the SOURCE content (source attnum 7), not flagged.
    expect(
      (composed.out as unknown as { columns: Array<{ position: number }> }).columns[0].position
    ).toBe(7);
  });

  // round-15: delta-neutral EXTRA identities (restore artifacts absent from the source,
  // e.g. the image manufacturing default ACLs on restore-created schemas) — MISSING stays
  // fatal, EXTRA is tolerated iff byte-identical across checkpoints and excluded from composed.
  const aclA = { role: 'r', schema: 'public', object_type: 'f', acl: ['x'] };
  const aclExtra = { role: 'supabase_admin', schema: 'tests', object_type: 'f', acl: ['y'] };

  it('_check_restore_completeness collects EXTRA identities without failing (round-15)', () => {
    const source = { schema_version: SV, database: { name: 'postgres' }, default_acls: [aclA] };
    const isolate = {
      schema_version: SV,
      database: { name: 'postgres' },
      default_acls: [aclA, aclExtra],
    };
    const res = callCore('_check_restore_completeness', [source, isolate]);
    expect(res.status, res.err).toBe(0);
    const extras = res.out as Array<{ section: string; identity: string }>;
    expect(extras.length).toBe(1);
    expect(extras[0].section).toBe('default_acls');
    expect(extras[0].identity).toContain('tests');
  });

  it('_compose_predicted_payload EXCLUDES a delta-neutral extra from the composed payload (round-15)', () => {
    const source = { schema_version: SV, database: { name: 'postgres' }, default_acls: [aclA] };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      default_acls: [aclA, aclExtra],
    };
    const iCheck = {
      schema_version: SV,
      database: { name: 'postgres' },
      default_acls: [aclA, aclExtra],
    };
    const composed = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    const payload = composed.out as { default_acls: Array<{ schema: string }> };
    // the extra (schema=tests) is excluded; only the source pre-existing entry remains.
    expect(payload.default_acls.length).toBe(1);
    expect(payload.default_acls[0].schema).toBe('public');
  });

  it('_compose_predicted_payload hard-stops when a tolerated extra MUTATES across checkpoints (round-15)', () => {
    const aclExtraMutated = {
      role: 'supabase_admin',
      schema: 'tests',
      object_type: 'f',
      acl: ['CHANGED'],
    };
    const source = { schema_version: SV, database: { name: 'postgres' }, default_acls: [aclA] };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      default_acls: [aclA, aclExtra],
    };
    const iCheck = {
      schema_version: SV,
      database: { name: 'postgres' },
      default_acls: [aclA, aclExtraMutated],
    };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[default_acls\]/u);
  });

  // round-19: the release window CREATE-OR-REPLACEs public.auto_answer_questions_atomic
  // (p_course_id uuid), which pre-exists in prod — an in-place MODIFICATION of a pre-existing
  // entry. It is the single frozen MIGRATION_MODIFIED_IDENTITY_ALLOWLIST entry: the composer
  // must take the ISOLATE POST-migration render (identical SQL, same PG), not the
  // pre-modification live source. The entry's compose identity is schema|name|identity_arguments|kind.
  const allowFnLive = {
    schema: 'public',
    name: 'auto_answer_questions_atomic',
    identity_arguments: 'p_course_id uuid',
    kind: 'f',
    definition: 'LIVE-OLD-DEF',
    acl: ['=X/postgres'],
  };
  const allowFnIsoPre = { ...allowFnLive, definition: 'ISO-OLD-DEF' };
  const allowFnIsoPost = {
    ...allowFnLive,
    definition: 'ISO-NEW-DEF',
    acl: ['authenticated=X/postgres'],
  };

  it('_compose_predicted_payload takes ISOLATE POST content for an allowlisted MODIFIED pre-existing entry (round-19)', () => {
    const source = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnLive] };
    const iPre = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnIsoPre] };
    const iCheck = {
      schema_version: SV,
      database: { name: 'postgres' },
      functions: [allowFnIsoPost],
    };
    const composed = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(composed.status, composed.err).toBe(0);
    const payload = composed.out as { functions: Array<{ name: string; definition: string }> };
    expect(payload.functions.length).toBe(1);
    // the migration replaces it: composed content is the isolate POST render, not the live
    // pre-modification source.
    expect(payload.functions[0].definition).toBe('ISO-NEW-DEF');
  });

  it('_compose_predicted_payload still hard-stops a NON-allowlisted function modification (round-19)', () => {
    const otherLive = { ...allowFnLive, name: 'some_other_rpc' };
    const otherPre = { ...otherLive, definition: 'ISO-OLD-DEF' };
    const otherPost = { ...otherLive, definition: 'ISO-NEW-DEF' };
    const source = { schema_version: SV, database: { name: 'postgres' }, functions: [otherLive] };
    const iPre = { schema_version: SV, database: { name: 'postgres' }, functions: [otherPre] };
    const iCheck = { schema_version: SV, database: { name: 'postgres' }, functions: [otherPost] };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[functions\]/u);
    expect(res.err).toMatch(/modified a pre-existing/iu);
  });

  it('_compose_predicted_payload collects non-additive violations across ALL sections before failing (round-19)', () => {
    const relLive = {
      schema: 'public',
      name: 't2',
      relation_schema: 'public',
      relation_name: 't2',
      definition: 'LIVE',
    };
    const relPre = { ...relLive, definition: 'ISO-OLD' };
    const relPost = { ...relLive, definition: 'ISO-NEW' };
    const alteredConstraint = { ...preExistingIsolate, definition: 'CHECK (different)' };
    const source = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingLive],
      relations: [relLive],
    };
    const iPre = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [preExistingIsolate],
      relations: [relPre],
    };
    const iCheck = {
      schema_version: SV,
      database: { name: 'postgres' },
      constraints: [alteredConstraint],
      relations: [relPost],
    };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    // BOTH violating sections are reported together (not fail-fast on the first).
    expect(res.err).toMatch(/\[constraints\]/u);
    expect(res.err).toMatch(/\[relations\]/u);
  });

  it('_compose_predicted_payload keeps a REMOVED allowlisted identity fatal (round-19)', () => {
    const source = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnLive] };
    const iPre = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnIsoPre] };
    const iCheck = { schema_version: SV, database: { name: 'postgres' }, functions: [] };
    const res = callCore('_compose_predicted_payload', [source, iPre, iCheck]);
    expect(res.status).toBe(7);
    expect(res.err).toMatch(/\[functions\]/u);
    expect(res.err).toMatch(/removed pre-existing/iu);
  });

  it('_check_restore_completeness accepts an allowlisted pre-existing entry with divergent content (round-19)', () => {
    const source = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnLive] };
    const iPre = { schema_version: SV, database: { name: 'postgres' }, functions: [allowFnIsoPre] };
    const res = callCore('_check_restore_completeness', [source, iPre]);
    expect(res.status, res.err).toBe(0);
    // identity preserved on both sides → no missing, no extra; content divergence is non-fatal here.
    expect(res.out as unknown[]).toEqual([]);
  });
});
