import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
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

describe('Q12 expected-post-migration-catalog plan builder', () => {
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
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const probe = docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'postgres']);
        if (probe.status === 0) {
          ready = true;
          break;
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
      }
      expect(ready, docker(['logs', container]).stdout).toBe(true);

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
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260704150249','frontier');
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
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260704150249','frontier');
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
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$mig/$3"
  "$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c \\
    "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('$1','$2',ARRAY['$1']::text[]);"
}
# The pinned Supabase image ships these roles; a vanilla PG17 isolate needs
# them created before the real migrations can GRANT to them.
"$d" exec -i "$c" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'ROLES'
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

  it('fails closed on a pre-migration structural-equality mismatch and reclaims the isolate', () => {
    const fixture = planFixture();

    const result = runLivePlan(fixture, { MC2_Q12_PLAN_FAULT: 'equality' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/structural catalog differs/iu);
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
