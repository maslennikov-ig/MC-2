import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const BARRIER = resolve(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh');
const STRUCTURAL_CATALOG = resolve(REPO_ROOT, 'deploy/qdrant/q12-structural-catalog.sql');
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const CAPABILITY_SENTINEL = 'q12-capability-synthetic-sentinel';
const URI_PASSWORD_SENTINEL = 'q12-uri-password-synthetic-sentinel';
const temporaryDirectories: string[] = [];

function source(): string {
  return readFileSync(BARRIER, 'utf8');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function expectedCatalog(): Record<string, unknown> {
  const publicRelations = Array.from({ length: 47 }, (_, index) => ({
    schema: 'public',
    name: `public_table_${String(index).padStart(2, '0')}`,
    oid: 100 + index,
    relkind: index === 0 ? 'p' : 'r',
    parent_oid: index === 1 ? 100 : null,
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
  return {
    schema_version: 'megacampus.q12.expected-post-migration-catalog/v1',
    database: 'postgres',
    database_owner: 'postgres',
    release_sha: '1'.repeat(40),
    migration_frontier: '20260704150249',
    baseline_structural_sha256: 'a'.repeat(64),
    expected_post_migration_catalog_sha256: 'b'.repeat(64),
    inventory_counts: { public: 47, auth: 22, storage: 5, cron_jobs: 8, pg_net_queue: 0 },
    guarded_relations: [
      ...publicRelations,
      ...authRelations,
      ...storageRelations,
      {
        schema: 'cron',
        name: 'job',
        oid: 400,
        relkind: 'r',
        parent_oid: null,
        owner: 'postgres',
      },
      {
        schema: 'net',
        name: 'http_request_queue',
        oid: 401,
        relkind: 'r',
        parent_oid: null,
        owner: 'postgres',
      },
    ],
    cron_jobs: Array.from({ length: 8 }, (_, index) => ({
      jobid: index + 1,
      username: 'postgres',
      command_sha256: String(index).repeat(64),
    })),
    migrations: {
      '20260711140000': {
        catalog_sha256: 'c'.repeat(64),
        migration_file_sha256: 'e'.repeat(64),
        relations: [
          {
            schema: 'public',
            name: 'document_evidence_runs',
            relkind: 'r',
            parent_schema: null,
            parent_name: null,
            owner: 'postgres',
          },
        ],
      },
      '20260711151000': {
        catalog_sha256: 'b'.repeat(64),
        migration_file_sha256: 'f'.repeat(64),
        relations: [
          {
            schema: 'public',
            name: 'document_evidence_observability_totals',
            relkind: 'r',
            parent_schema: null,
            parent_name: null,
            owner: 'postgres',
          },
        ],
      },
    },
  };
}

function evaluateRollbackLockPlan(
  catalog: ReturnType<typeof expectedCatalog>,
  committedGuards: readonly string[]
): string[] {
  const allowedPhases = [[], ['20260711140000'], ['20260711140000', '20260711151000']];
  const phase = [...committedGuards].sort();
  if (!allowedPhases.some(allowed => JSON.stringify(allowed) === JSON.stringify(phase))) {
    throw new Error('rollback migration guard phase is impossible');
  }
  const typed = catalog as {
    guarded_relations: Array<{ schema: string; name: string; oid: number }>;
    migrations: Record<string, { relations: Array<{ schema: string; name: string }> }>;
  };
  return [
    ...typed.guarded_relations,
    ...phase.flatMap(migration => typed.migrations[migration].relations),
  ]
    .sort((left, right) =>
      `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`)
    )
    .map(relation => `${relation.schema}.${relation.name}`);
}

interface BarrierFixture {
  args: string[];
  env: NodeJS.ProcessEnv;
  capability: string;
  catalog: string;
  dbUrl: string;
  ca: string;
  nodeArgsLog: string;
  nodeEnvLog: string;
  sqlLog: string;
  receipt: string;
  probeReceipt: string;
}

function rewriteExpectedCatalog(
  fixture: BarrierFixture,
  mutate: (catalog: Record<string, any>) => void
): void {
  const catalog = JSON.parse(readFileSync(fixture.catalog, 'utf8')) as Record<string, any>;
  mutate(catalog);
  chmodSync(fixture.catalog, 0o600);
  const body = `${JSON.stringify(catalog)}\n`;
  writeFileSync(fixture.catalog, body);
  chmodSync(fixture.catalog, 0o400);
  fixture.args[fixture.args.indexOf('--expected-post-migration-catalog-sha256') + 1] = createHash(
    'sha256'
  )
    .update(body)
    .digest('hex');
}

function barrierFixture(): BarrierFixture {
  const root = mkdtempSync('/tmp/mc2-q12-barrier-');
  temporaryDirectories.push(root);
  chmodSync(root, 0o700);
  const project = join(root, 'project/packages/course-gen-platform');
  const secrets = join(root, 'secrets');
  const runRoot = join(root, 'backups/q12', RUN_ID);
  const runSecrets = join(runRoot, 'secrets');
  for (const directory of [project, secrets, runRoot, runSecrets]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  const dbUrl = join(secrets, 'supabase_db_url');
  const ca = join(secrets, 'prod-ca.crt');
  const capability = join(runSecrets, 'db-capability');
  const catalog = join(runRoot, 'expected-catalog.json');
  const probeReceipt = join(runRoot, 'database-barrier-probe-receipt.json');
  writeFileSync(
    dbUrl,
    `postgresql://postgres.diqooqbuchsliypgwksu:${URI_PASSWORD_SENTINEL}@aws-1-us-east-2.pooler.supabase.com:5432/postgres\n`,
    { mode: 0o600 }
  );
  writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
  writeFileSync(capability, `${CAPABILITY_SENTINEL}\n`, { mode: 0o400 });
  const catalogBody = `${JSON.stringify(expectedCatalog(), null, 2)}\n`;
  writeFileSync(catalog, catalogBody, { mode: 0o400 });
  const catalogSha = createHash('sha256').update(catalogBody).digest('hex');
  writeFileSync(
    probeReceipt,
    `${JSON.stringify({
      schema_version: 'megacampus.q12.database-barrier-probes/v1',
      run_id: RUN_ID,
      expected_catalog_sha256: catalogSha,
      completed_at: '2026-07-13T12:00:00.000Z',
      probes: {
        postgrest_anon: 'rejected',
        postgrest_authenticated: 'rejected',
        postgrest_service_role_without_capability: 'rejected',
        postgrest_service_role_with_capability: 'rolled_back',
        postgrest_preference_applied: 'tx=rollback',
        auth_profile: 'rejected_zero_residue',
        storage_object: 'rejected_zero_metadata_zero_bytes',
        cron_rpc: 'rejected_exact_jobs_unchanged',
        pg_net_rpc: 'rejected_zero_queue_zero_external_request',
        direct_supervisor: 'rolled_back',
      },
      residue: {
        guard_probe_rows: 0,
        auth_rows: 0,
        storage_metadata_rows: 0,
        storage_object_bytes: 0,
        cron_job_set_unchanged: true,
        pg_net_queue_rows: 0,
        external_requests: 0,
      },
    })}\n`,
    { mode: 0o400 }
  );
  const fakeNode = join(root, 'fake-node');
  const nodeArgsLog = join(root, 'node-args.log');
  const nodeEnvLog = join(root, 'node-env.log');
  const sqlLog = join(root, 'sql.log');
  writeFileSync(
    fakeNode,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$NODE_ARGS_LOG"
env | sort > "$NODE_ENV_LOG"
cp -- "$8" "$SQL_LOG"
if [[ "\${12:-}" == before-receipt ]]; then
  printf '%s\n' "$3" > "$MC2_Q12_FAKE_COMMITTED_OPERATION"
  exit 82
fi
`,
    { mode: 0o700 }
  );
  return {
    capability,
    catalog,
    dbUrl,
    ca,
    nodeArgsLog,
    nodeEnvLog,
    sqlLog,
    receipt: join(runRoot, 'database-barrier-receipt.json'),
    probeReceipt,
    env: {
      PATH: process.env.PATH,
      MC2_Q12_BARRIER_TEST_MODE: 'mc2-synthetic-q12-database-barrier-test-only',
      MC2_Q12_BARRIER_TEST_ROOT: root,
      MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY: join(root, 'project'),
      MC2_Q12_BARRIER_TEST_NODE: fakeNode,
      NODE_ARGS_LOG: nodeArgsLog,
      NODE_ENV_LOG: nodeEnvLog,
      SQL_LOG: sqlLog,
    },
    args: [
      '--run-id',
      RUN_ID,
      '--db-url-file',
      dbUrl,
      '--ca-file',
      ca,
      '--q12-db-capability-file',
      capability,
      '--expected-post-migration-catalog',
      catalog,
      '--expected-post-migration-catalog-sha256',
      catalogSha,
    ],
  };
}

describe('Q12 durable database maintenance barrier', () => {
  it('freezes the exact file-only command surface and owner-only receipt contract', () => {
    const script = source();
    for (const command of ['install', 'verify-extended', 'activate', 'rollback', 'cleanup']) {
      expect(script).toContain(`${command})`);
    }
    for (const option of [
      '--run-id',
      '--db-url-file',
      '--ca-file',
      '--q12-db-capability-file',
      '--expected-post-migration-catalog',
      '--expected-post-migration-catalog-sha256',
      '--after-migration',
    ]) {
      expect(script).toContain(option);
    }
    expect(script).toContain('megacampus.q12.expected-post-migration-catalog/v1');
    expect(script).toContain('megacampus.q12.database-barrier-receipt/v1');
    expect(script).toContain('megacampus.q12.database-barrier-probes/v1');
    expect(script).toContain('database-barrier-probe-receipt.json');
    expect(script).toContain('/opt/megacampus/backups/q12/$run_id/secrets/db-capability');
    expect(script).toContain('chmod 0400');
    expect(script).toContain('O_NOFOLLOW');
  });

  it('builds one deterministic lock boundary plus complete owner-only row/TRUNCATE guards', () => {
    const script = source();
    expect(script).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(script).toContain('LOCK TABLE');
    expect(script).toContain('IN ACCESS EXCLUSIVE MODE');
    expect(script).toContain('pg_prepared_xacts');
    expect(script).toContain('CREATE SCHEMA q12_guard AUTHORIZATION postgres');
    expect(script).toContain('CREATE EVENT TRIGGER q12_guard_ddl_command_start');
    expect(script).toContain('ON ddl_command_start');
    expect(script).toContain('q12_guard.enforce_ddl_barrier');
    expect(script).toContain('SECURITY DEFINER SET search_path=pg_catalog,q12_guard');
    expect(script).toContain("session_user='postgres'");
    expect(script).toContain("session_user='authenticator'");
    expect(script).toContain('request.jwt.claims');
    expect(script).toContain('request.headers');
    expect(script).toContain('x-q12-capability');
    expect(script).toContain('IS DISTINCT FROM');
    expect(script).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(script).toContain('BEFORE TRUNCATE');
    expect(script).toContain('tgparentid');
    expect(script).toContain('aclexplode');
    expect(script).toContain("relkind='S'");
    expect(script).toContain('ALTER DATABASE postgres SET default_transaction_read_only=on');
    expect(script).toContain('pg_terminate_backend');
  });

  it('pins eight cron rows, empty pg_net, verify-only extension, activation and zero residue', () => {
    const script = source();
    expect(script).toContain("jsonb_array_length(expected->'cron_jobs') <> 8");
    expect(script).toContain('net.http_request_queue');
    expect(script).toContain('UPDATE cron.job SET active=false');
    expect(script).toContain('q12_guard.extend_guard');
    expect(script).toContain('q12_guard.verify_capability');
    expect(script).toContain('20260711140000');
    expect(script).toContain('20260711151000');
    expect(script).toContain('verify-extended is read-only and cannot repair guard drift');
    expect(script).toContain('DROP SCHEMA q12_guard');
    expect(script).toContain('guard_cleanup_complete');
    expect(script).toContain('zero_guard_residue');
    expect(script).toContain('fsync');
  });

  it('captures nonportable future OIDs only after stable identity match and makes the receipt append-only', () => {
    const fixture = barrierFixture();
    const catalog = JSON.parse(readFileSync(fixture.catalog, 'utf8')) as Record<string, any>;
    for (const migration of Object.values(catalog.migrations)) {
      for (const relation of migration.relations) {
        expect(Object.keys(relation).sort()).toEqual(
          ['name', 'owner', 'parent_name', 'parent_schema', 'relkind', 'schema'].sort()
        );
        expect(relation).not.toHaveProperty('oid');
        expect(relation).not.toHaveProperty('parent_oid');
      }
    }

    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql).toContain('stable_expected jsonb NOT NULL');
    expect(sql).toContain("'oid',c.oid::bigint");
    expect(sql).toContain("'parent_oid',inheritance.inhparent");
    expect(sql).toContain('guard.stable_expected IS DISTINCT FROM');
    expect(sql).toContain('c.oid=e.oid');
    expect(sql).toContain('INSERT INTO q12_guard.migration_guards');
    expect(sql).not.toContain('ON CONFLICT');
    expect(sql).not.toMatch(/UPDATE q12_guard\.migration_guards/iu);
  });

  it('rejects future relation OID fields and stable-identity drift instead of learning it', () => {
    const fixture = barrierFixture();
    rewriteExpectedCatalog(fixture, catalog => {
      catalog.migrations['20260711140000'].relations[0].oid = 987_654;
    });

    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/catalog.*exact inventory/iu);
    expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
  });

  it('passes only FD numbers to the DB runner and emits deterministic install SQL without secret leakage', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const captured = [
      result.stdout,
      result.stderr,
      readFileSync(fixture.nodeArgsLog, 'utf8'),
      readFileSync(fixture.nodeEnvLog, 'utf8'),
      readFileSync(fixture.sqlLog, 'utf8'),
      readFileSync(fixture.receipt, 'utf8'),
    ].join('\n');
    expect(captured).not.toContain(CAPABILITY_SENTINEL);
    expect(captured).not.toContain(URI_PASSWORD_SENTINEL);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    const freshSql = sql.slice(
      sql.indexOf('-- Q12_INSTALL_FRESH_BEGIN'),
      sql.indexOf('-- Q12_INSTALL_FRESH_END')
    );
    const tx1Sql = freshSql.slice(0, freshSql.indexOf('-- Q12_INSTALL_TX1_COMMITTED'));
    expect(tx1Sql.match(/^LOCK TABLE/gmu) ?? []).toHaveLength(1);
    const lockStatement = sql.match(/LOCK TABLE ([^;]+) IN ACCESS EXCLUSIVE MODE;/u)?.[1];
    expect(lockStatement).toMatch(/"public"\."public_table_00"[\s\S]*"cron"\."job"/u);
    expect(lockStatement).not.toContain('document_evidence_runs');
    expect(sql).toContain('CREATE TRIGGER q12_guard_row');
    expect(sql).toContain('CREATE TRIGGER q12_guard_truncate');
    expect(sql).toContain('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA q12_guard FROM PUBLIC');
    expect(sql.match(/INSERT INTO q12_guard\.migration_guards/gu) ?? []).toHaveLength(1);
    expect(sql).toContain('EXCEPT');
    expect(sql).toContain('tgtype');
    expect(sql).toContain('root.tgrelid');
    expect(sql).toContain("ARRAY['active_run','baseline','migration_guards','probe']");
    expect(sql).toContain(
      "ARRAY['assert_capability','assert_controller_binding','enforce_ddl_barrier','enforce_write_barrier','extend_guard','quiesce_client_backends','verify_activated_state','verify_capability','verify_expected_guards','verify_install_resume_state']"
    );
    const genericCapability = sql.slice(
      sql.indexOf('CREATE FUNCTION q12_guard.assert_capability()'),
      sql.indexOf('CREATE FUNCTION q12_guard.assert_controller_binding()')
    );
    expect(genericCapability).toContain(
      "supplied := current_setting('megacampus.q12_capability',true)"
    );
    expect(genericCapability).not.toContain('megacampus.q12_run_id');
    expect(genericCapability).not.toContain('megacampus.q12_expected_catalog');
    const controllerBinding = sql.slice(
      sql.indexOf('CREATE FUNCTION q12_guard.assert_controller_binding()'),
      sql.indexOf('CREATE FUNCTION q12_guard.enforce_ddl_barrier()')
    );
    expect(controllerBinding).toContain('PERFORM q12_guard.assert_capability()');
    expect(controllerBinding).toContain("current_setting('megacampus.q12_run_id',true)");
    const extension = sql.slice(
      sql.indexOf('CREATE FUNCTION q12_guard.extend_guard('),
      sql.indexOf('CREATE FUNCTION q12_guard.verify_expected_guards(')
    );
    expect(extension).toContain('PERFORM q12_guard.assert_capability()');
    expect(extension).not.toContain('assert_controller_binding');
    const preStructural = sql.indexOf('pre-guard canonical structural catalog drift');
    const firstGuardMutation = sql.indexOf('CREATE SCHEMA q12_guard AUTHORIZATION postgres');
    expect(preStructural).toBeGreaterThanOrEqual(0);
    expect(firstGuardMutation).toBeGreaterThan(preStructural);
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'maintenance_guarded',
      zero_guard_residue: false,
      rollback_probes_verified: false,
    });
  });

  it('does not follow a crash-stale predictable database-receipt temporary symlink', () => {
    const fixture = barrierFixture();
    const victim = join(resolve(fixture.receipt, '..'), 'receipt-symlink-victim');
    writeFileSync(victim, 'unchanged\n', { mode: 0o400 });
    const result = spawnSync(
      'bash',
      [
        '-c',
        'victim="$1"; receipt="$2"; barrier="$3"; shift 3; ln -s -- "$victim" "$receipt.tmp.$$"; exec bash "$barrier" install "$@"',
        'q12-receipt-stale-temp',
        victim,
        fixture.receipt,
        BARRIER,
        ...fixture.args,
      ],
      { env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(victim, 'utf8')).toBe('unchanged\n');
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'maintenance_guarded',
    });
  });

  it('rejects a cross-wired or incomplete owner-only probe receipt before post-probe DB work', () => {
    const fixture = barrierFixture();
    const receipt = JSON.parse(readFileSync(fixture.probeReceipt, 'utf8')) as Record<string, any>;
    receipt.run_id = '323e4567-e89b-42d3-a456-426614174000';
    receipt.probes.postgrest_preference_applied = 'missing';
    chmodSync(fixture.probeReceipt, 0o600);
    writeFileSync(fixture.probeReceipt, `${JSON.stringify(receipt)}\n`, { mode: 0o400 });
    chmodSync(fixture.probeReceipt, 0o400);

    const result = spawnSync(
      'bash',
      [BARRIER, 'verify-extended', '--after-migration', '20260711140000', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/probe receipt/iu);
    expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
  });

  it('keeps verify-extended verification-only and incapable of repairing drift', () => {
    const fixture = barrierFixture();
    const result = spawnSync(
      'bash',
      [BARRIER, 'verify-extended', '--after-migration', '20260711140000', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql).toContain('BEGIN ISOLATION LEVEL READ COMMITTED');
    const capability = sql.indexOf('SELECT q12_guard.assert_controller_binding()');
    const lock = sql.indexOf('LOCK TABLE');
    const verify = sql.indexOf('SELECT q12_guard.verify_expected_guards');
    expect(capability).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(capability);
    expect(verify).toBeGreaterThan(lock);
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
  });

  it('locks post-migration tables only during activation after same-transaction extension', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'activate', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    const lockStatement = sql.match(/LOCK TABLE ([^;]+) IN ACCESS EXCLUSIVE MODE;/u)?.[1];
    expect(lockStatement).toContain('"public"."document_evidence_runs"');
    expect(lockStatement).toContain('"public"."document_evidence_observability_totals"');
    expect(lockStatement).toContain('"supabase_migrations"."schema_migrations"');
    const capability = sql.indexOf('SELECT q12_guard.assert_controller_binding()');
    const lock = sql.indexOf('LOCK TABLE');
    const verify = sql.indexOf("SELECT q12_guard.verify_expected_guards('20260711151000')");
    const restore = sql.indexOf('DO $restore$');
    expect(capability).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(capability);
    expect(verify).toBeGreaterThan(lock);
    expect(restore).toBeGreaterThan(verify);
    expect(sql).toContain("t.tgname='q12_guard_truncate'");
    expect(sql).toContain("t.tgname='q12_guard_row'");
    expect(sql).not.toContain("t.tgname='q12_guard_immutable'");
    expect(sql).toContain('q12_guard_ddl_command_start');
  });

  it('derives rollback locks from base plus only committed migration guard truth at every phase', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'rollback', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql.indexOf('SELECT q12_guard.assert_controller_binding()')).toBeLessThan(
      sql.indexOf('DO $rollback_lock$')
    );
    expect(sql).toContain("relations := expected->'guarded_relations'");
    expect(sql).toContain('FROM q12_guard.migration_guards ORDER BY migration');
    expect(sql).toContain('relations := relations || guard.relation_set');
    expect(sql).toContain("EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE'");
    const historyLock = sql.indexOf(
      'LOCK TABLE "supabase_migrations"."schema_migrations" IN ACCESS EXCLUSIVE MODE'
    );
    const phaseLock = sql.indexOf("EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE'");
    const phaseVerify = sql.indexOf('PERFORM q12_guard.verify_expected_guards(checkpoint)');
    const restore = sql.indexOf('DO $restore$');
    expect(historyLock).toBeGreaterThanOrEqual(0);
    expect(phaseLock).toBeGreaterThan(historyLock);
    expect(phaseVerify).toBeGreaterThan(phaseLock);
    expect(restore).toBeGreaterThan(phaseVerify);
    expect(sql).not.toContain('"public"."document_evidence_runs"');
    expect(sql).not.toContain('"public"."document_evidence_observability_totals"');
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'guard_cleanup_complete',
      zero_guard_residue: true,
      last_command: 'rollback',
      rollback_probes_verified: false,
      probe_receipt_sha256: null,
    });
  });

  it.each([
    ['pre-base', [], false, false],
    ['after-base', ['20260711140000'], true, false],
    ['after-observability', ['20260711140000', '20260711151000'], true, true],
  ] as const)(
    'evaluates the exact %s rollback phase without referencing future relations',
    (_phase, guards, includesBase, includesObservability) => {
      const locks = evaluateRollbackLockPlan(expectedCatalog(), guards);
      expect(locks).toContain('public.public_table_00');
      expect(locks.includes('public.document_evidence_runs')).toBe(includesBase);
      expect(locks.includes('public.document_evidence_observability_totals')).toBe(
        includesObservability
      );
      expect(new Set(locks).size).toBe(locks.length);
    }
  );

  it('rejects the impossible observability-without-base rollback phase', () => {
    expect(() => evaluateRollbackLockPlan(expectedCatalog(), ['20260711151000'])).toThrow(
      /phase is impossible/iu
    );
  });

  it('rejects duplicate relation identity across base and future migration sets', () => {
    const fixture = barrierFixture();
    rewriteExpectedCatalog(fixture, catalog => {
      catalog.migrations['20260711140000'].relations[0].schema =
        catalog.guarded_relations[0].schema;
      catalog.migrations['20260711140000'].relations[0].name = catalog.guarded_relations[0].name;
    });

    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/catalog.*exact inventory/iu);
    expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
  });

  it('restores the exact captured database default before rollback drops guard state', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'rollback', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    const restoreDefault = sql.indexOf("saved->>'default_transaction_read_only'");
    const dropSchema = sql.indexOf('DROP SCHEMA q12_guard CASCADE');
    expect(restoreDefault).toBeGreaterThanOrEqual(0);
    expect(dropSchema).toBeGreaterThan(restoreDefault);
    expect(sql).not.toContain('prior := NULL');
    expect(sql).toContain('t.tgparentid=0');
    expect(sql.indexOf("t.tgname='q12_guard_truncate'")).toBeLessThan(
      sql.indexOf("t.tgname='q12_guard_row'")
    );
  });

  it('unlinks the fixed capability only after cleanup returns zero residue', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'cleanup', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(() => readFileSync(fixture.capability)).toThrow();
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'guard_cleanup_complete',
      zero_guard_residue: true,
    });
  });

  it('rejects unknown top-level catalog fields and a seventy-seventh public relation', () => {
    for (const mutate of [
      (catalog: Record<string, any>) => {
        catalog.non_authoritative_relations = [];
      },
      (catalog: Record<string, any>) => {
        catalog.guarded_relations.push({
          schema: 'public',
          name: 'unexpected_public_relation',
          oid: 999_999,
          relkind: 'r',
          parent_oid: null,
          owner: 'postgres',
        });
      },
    ]) {
      const fixture = barrierFixture();
      rewriteExpectedCatalog(fixture, mutate);
      const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/catalog.*exact inventory/iu);
      expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
    }
  });

  it.each([
    ['database URL', 'dbUrl', 'install'],
    ['CA', 'ca', 'install'],
    ['capability', 'capability', 'install'],
    ['expected catalog', 'catalog', 'install'],
    ['probe receipt', 'probeReceipt', 'activate'],
  ] as const)(
    'rejects a same-target symlink for the %s input before DB work',
    (_label, key, command) => {
      const fixture = barrierFixture();
      const original = fixture[key];
      const target = `${original}.target`;
      renameSync(original, target);
      symlinkSync(target, original);

      const result = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/canonical|regular file|symlink|safe path|O_NOFOLLOW/iu);
      expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
    }
  );

  it('freezes the structural catalog payload families and detects one-field drift', () => {
    const sql = readFileSync(STRUCTURAL_CATALOG, 'utf8');
    expect(sql.trim()).not.toContain(';');
    expect(sql).toContain('megacampus.q12.structural-catalog-payload/v1');
    expect(sql).toContain(
      "encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex')"
    );
    const families = [
      'database',
      'schemas',
      'relations',
      'columns',
      'sequences',
      'extensions',
      'types',
      'access_methods',
      'casts',
      'collations',
      'conversions',
      'foreign_data_wrappers',
      'foreign_servers',
      'foreign_tables',
      'user_mappings',
      'indexes',
      'constraints',
      'functions',
      'languages',
      'operators',
      'operator_families',
      'operator_classes',
      'triggers',
      'event_triggers',
      'rules',
      'aggregates',
      'policies',
      'extended_statistics',
      'text_search_parsers',
      'text_search_templates',
      'text_search_dictionaries',
      'text_search_configurations',
      'transforms',
      'publications',
      'subscriptions',
      'default_acls',
      'parameter_acls',
      'comments',
      'security_labels',
      'migration_history',
    ] as const;
    for (const family of families) expect(sql).toContain(`'${family}'`);
    expect(sql).toContain("n.nspname <> 'q12_guard'");
    expect(sql).toContain('ORDER BY parent_namespace.nspname, parent.relname');
    expect(sql).toContain(
      "ARRAY['default_transaction_read_only','cron.database_name','cron.launch_active_jobs']"
    );
    expect(sql).toContain("to_jsonb(database_object)->>'datlocale'");
    expect(sql).toContain("to_jsonb(database_object)->>'datbuiltinlocale'");
    expect(sql).not.toContain('conenforced');
    expect(sql).toContain("CASE WHEN role_oid.oid = 0 THEN 'PUBLIC'");
    expect(sql).toContain('FROM pg_catalog.pg_parameter_acl parameter_acl');
    expect(sql).toContain("CASE WHEN exploded.grantee = 0 THEN 'PUBLIC'");
    expect(sql).toContain("CASE WHEN relation.relkind = 'S' THEN 's' ELSE 'r' END");
    expect(sql).toContain("pg_catalog.acldefault('s', relation.relowner)");
    expect(sql).toContain("pg_catalog.acldefault('S', server.srvowner)");
    expect(sql).not.toContain("pg_catalog.acldefault('S', relation.relowner)");
    expect(sql).not.toContain("pg_catalog.acldefault('s', server.srvowner)");

    const payload = Object.fromEntries(
      families.map((family, index) => [
        family,
        [{ field: `value-${index}`, acl: ['owner=a*/grantor'] }],
      ])
    );
    const stableHash = (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const original = stableHash(payload);
    for (const family of families) {
      const changed = structuredClone(payload);
      changed[family][0].field = `${changed[family][0].field}-changed`;
      expect(stableHash(changed)).not.toBe(original);
    }
    for (const family of ['relations', 'sequences', 'default_acls'] as const) {
      const changed = structuredClone(payload);
      changed[family][0].acl = ['owner=a/grantor'];
      expect(stableHash(changed)).not.toBe(original);
    }
  });

  it('projects exact schema-less COMMENT and SECURITY LABEL class boundaries without OID ordering or raw FDW options', () => {
    const sql = readFileSync(STRUCTURAL_CATALOG, 'utf8');
    const commentClasses = [
      'pg_am',
      'pg_cast',
      'pg_event_trigger',
      'pg_foreign_data_wrapper',
      'pg_foreign_server',
      'pg_language',
      'pg_publication',
      'pg_subscription',
      'pg_transform',
    ] as const;
    const securityLabelClasses = [
      'pg_event_trigger',
      'pg_language',
      'pg_publication',
      'pg_subscription',
    ] as const;
    const commentBoundary = sql.slice(
      sql.indexOf('schema_less_comment_classes AS ('),
      sql.indexOf('schema_less_security_label_classes AS (')
    );
    const securityLabelBoundary = sql.slice(
      sql.indexOf('schema_less_security_label_classes AS ('),
      sql.indexOf('database_row AS (')
    );
    for (const catalog of commentClasses) {
      expect(commentBoundary).toContain(`'pg_catalog.${catalog}'::regclass`);
    }
    for (const catalog of securityLabelClasses) {
      expect(securityLabelBoundary).toContain(`'pg_catalog.${catalog}'::regclass`);
    }
    expect(commentBoundary.match(/::regclass/gu) ?? []).toHaveLength(commentClasses.length);
    expect(securityLabelBoundary.match(/::regclass/gu) ?? []).toHaveLength(
      securityLabelClasses.length
    );
    expect(sql).toContain("identified.identity <> 'q12_guard_ddl_command_start'");

    const foreignTableRows = sql.slice(
      sql.indexOf('foreign_table_rows AS ('),
      sql.indexOf('index_rows AS (')
    );
    expect(foreignTableRows).not.toContain('jsonb_agg(option ORDER BY option)');
    expect(foreignTableRows.match(/'value_sha256'/gu) ?? []).toHaveLength(3);

    const operators = sql.slice(
      sql.indexOf('operator_rows AS ('),
      sql.indexOf('operator_family_rows AS (')
    );
    const operatorFamilies = sql.slice(
      sql.indexOf('operator_family_rows AS ('),
      sql.indexOf('operator_class_rows AS (')
    );
    expect(operators).not.toMatch(/ORDER BY[^\n]*oprleft|ORDER BY[^\n]*oprright/u);
    expect(operatorFamilies).not.toMatch(/ORDER BY[^\n]*amoplefttype/u);
    expect(operatorFamilies).not.toMatch(/ORDER BY[^\n]*amproclefttype/u);
  });

  it('keeps stored guard truth immutable through activation and leaves exact internal cleanup state', () => {
    const installFixture = barrierFixture();
    expect(
      spawnSync('bash', [BARRIER, 'install', ...installFixture.args], {
        env: installFixture.env,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const installSql = readFileSync(installFixture.sqlLog, 'utf8');
    expect(installSql).toContain('Q12 durable guard truth is append-only');
    expect(installSql).toContain("TG_TABLE_NAME='migration_guards' AND TG_OP='INSERT'");
    expect(installSql).toContain('OLD.activated=false AND NEW.activated=true');
    expect(installSql).toContain('CREATE TRIGGER q12_guard_immutable');
    expect(installSql).toContain('CREATE TRIGGER q12_guard_immutable_truncate');
    expect(installSql).toContain('REVOKE ALL ON TYPE q12_guard.%I FROM PUBLIC');
    expect(installSql).toContain(
      "ARRAY['p_migration','p_expected_relations','p_migration_file_sha256','p_expected_catalog_sha256']"
    );

    const activationFixture = barrierFixture();
    expect(
      spawnSync('bash', [BARRIER, 'activate', ...activationFixture.args], {
        env: activationFixture.env,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const activationSql = readFileSync(activationFixture.sqlLog, 'utf8');
    expect(activationSql).toContain('q12_guard_immutable');
    expect(activationSql).toContain('q12_guard_immutable_truncate');
    expect(activationSql).toContain('internal Q12 guard trigger set drift before activation');
    expect(activationSql).toContain('q12_guard_ddl_command_start');

    const cleanupFixture = barrierFixture();
    expect(
      spawnSync('bash', [BARRIER, 'cleanup', ...cleanupFixture.args], {
        env: cleanupFixture.env,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const cleanupSql = readFileSync(cleanupFixture.sqlLog, 'utf8');
    expect(cleanupSql).toContain('exact internal Q12 guard cleanup state drift');
    expect(cleanupSql).toContain('DROP EVENT TRIGGER q12_guard_ddl_command_start');
    expect(cleanupSql).toContain('DROP SCHEMA q12_guard CASCADE');
    expect(cleanupSql.indexOf('DROP EVENT TRIGGER')).toBeLessThan(
      cleanupSql.indexOf('DROP SCHEMA q12_guard CASCADE')
    );
  });

  it('uses a persistent event fence, exact managed-admin trust boundary, and fail-closed quiescence', () => {
    const fixture = barrierFixture();
    expect(
      spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql).toContain('CREATE EVENT TRIGGER q12_guard_ddl_command_start');
    expect(sql).toContain('CREATE FUNCTION q12_guard.quiesce_client_backends()');
    expect(sql).toContain("backend_type='client backend'");
    expect(sql).toContain("client.usename='supabase_admin'");
    expect(sql).toContain("client.state IS DISTINCT FROM 'idle'");
    expect(sql).toContain('client.xact_start IS NOT NULL');
    expect(sql).toContain('client.backend_xid IS NOT NULL');
    expect(sql).toContain('client.backend_xmin IS NOT NULL');
    expect(sql).toContain('terminated IS DISTINCT FROM true');
    expect(sql).toContain('unterminable non-allowlisted client blocks Q12 visibility proof');
    expect(sql).toContain('unquiesced managed supabase_admin client blocks Q12 visibility proof');
    expect(sql).toContain('Supautils deliberately skips reserved/superuser roles');
  });

  it('freezes idempotent install-resume and protected crash fault boundaries', () => {
    const script = source();
    for (const marker of [
      '-- Q12_INSTALL_FRESH_BEGIN',
      '-- Q12_INSTALL_TX1_COMMITTED',
      '-- Q12_INSTALL_SECOND_TERMINATE',
      '-- Q12_INSTALL_TX2_BEGIN',
      '-- Q12_INSTALL_FRESH_END',
      '-- Q12_INSTALL_RESUME_BEGIN',
      '-- Q12_INSTALL_RESUME_END',
    ]) {
      expect(script).toContain(marker);
    }
    expect(script).toContain('to_regnamespace(\\u0027q12_guard\\u0027) IS NOT NULL AS present');
    expect(script).toContain('durable install resume state drift');
    expect(script).toContain('after-tx1-commit|before-second-terminate|before-tx2|before-receipt');
    expect(script).toContain('if(operation!=="install")');
    expect(script).toContain('const fresh=!state.rows[0].present');
    const resumeStart = script.indexOf('-- Q12_INSTALL_RESUME_BEGIN');
    const preResumeProof = script.indexOf(
      'SELECT q12_guard.verify_install_resume_state()',
      resumeStart
    );
    const terminate = script.indexOf('SELECT q12_guard.quiesce_client_backends()', resumeStart);
    const defaultMutation = script.indexOf(
      'ALTER DATABASE postgres SET default_transaction_read_only=on',
      resumeStart
    );
    expect(preResumeProof).toBeGreaterThan(resumeStart);
    expect(terminate).toBeGreaterThan(preResumeProof);
    expect(defaultMutation).toBeGreaterThan(terminate);
  });

  it('recovers an activate COMMIT-to-receipt crash only through exact durable activated-state proof', () => {
    const fixture = barrierFixture();
    const committedOperation = join(resolve(fixture.receipt, '..'), 'fake-committed-operation');
    const faulted = spawnSync('bash', [BARRIER, 'activate', ...fixture.args], {
      env: {
        ...fixture.env,
        MC2_Q12_BARRIER_FAULT_POINT: 'before-receipt',
        MC2_Q12_FAKE_COMMITTED_OPERATION: committedOperation,
      },
      encoding: 'utf8',
    });

    expect(faulted.status).not.toBe(0);
    expect(readFileSync(committedOperation, 'utf8').trim()).toBe('activate');
    expect(existsSync(fixture.receipt)).toBe(false);
    const retried = spawnSync('bash', [BARRIER, 'activate', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });
    expect(retried.status, retried.stderr).toBe(0);
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'activated',
      last_command: 'activate',
      zero_guard_residue: false,
    });
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql).toContain('-- Q12_ACTIVATE_NORMAL_BEGIN');
    expect(sql).toContain('-- Q12_ACTIVATE_RECOVERY_BEGIN');
    expect(sql).toContain('SELECT q12_guard.verify_activated_state()');
    const script = source();
    expect(script).toContain('activationState.rows[0].activated===true');
    expect(script).toContain(
      'activated?between(sql,"-- Q12_ACTIVATE_RECOVERY_BEGIN","-- Q12_ACTIVATE_RECOVERY_END")'
    );
    expect(script).toContain('exact durable activated Q12 state drift');
  });

  it('publishes recovery_ready_guarded only from the exact final verified migration receipt', () => {
    const fixture = barrierFixture();
    const verified = spawnSync(
      'bash',
      [BARRIER, 'verify-extended', '--after-migration', '20260711151000', ...fixture.args],
      { env: fixture.env, encoding: 'utf8' }
    );
    expect(verified.status, verified.stderr).toBe(0);

    const prepared = spawnSync('bash', [BARRIER, 'prepare-recovery', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(prepared.status, prepared.stderr).toBe(0);
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      state: 'recovery_ready_guarded',
      last_command: 'prepare-recovery',
      zero_guard_residue: false,
      rollback_probes_verified: true,
    });
    const sql = readFileSync(fixture.sqlLog, 'utf8');
    expect(sql).toContain('BEGIN READ ONLY');
    expect(sql).toContain("SELECT q12_guard.verify_expected_guards('20260711151000')");
    expect(sql).toContain('default_transaction_read_only=on');
    expect(sql).toContain('SELECT q12_guard.quiesce_client_backends()');
    expect(sql).toContain('cron/pg_net recovery readiness drift');
    const script = source();
    expect(script).toContain('recovery readiness inherited read-only proof');
    expect(script).toContain('new Client({...connection');
  });

  it('rejects prepare-recovery without an exact final verification receipt before DB work', () => {
    const fixture = barrierFixture();
    const result = spawnSync('bash', [BARRIER, 'prepare-recovery', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/final.*verified.*receipt|recovery readiness/iu);
    expect(() => readFileSync(fixture.nodeArgsLog)).toThrow();
  });

  it('leaves the final verified receipt authoritative across a prepare-recovery receipt fault and retries idempotently', () => {
    const fixture = barrierFixture();
    expect(
      spawnSync(
        'bash',
        [BARRIER, 'verify-extended', '--after-migration', '20260711151000', ...fixture.args],
        { env: fixture.env, encoding: 'utf8' }
      ).status
    ).toBe(0);
    const before = readFileSync(fixture.receipt, 'utf8');
    const committedOperation = join(resolve(fixture.receipt, '..'), 'fake-prepare-operation');
    const faulted = spawnSync('bash', [BARRIER, 'prepare-recovery', ...fixture.args], {
      env: {
        ...fixture.env,
        MC2_Q12_BARRIER_FAULT_POINT: 'before-receipt',
        MC2_Q12_FAKE_COMMITTED_OPERATION: committedOperation,
      },
      encoding: 'utf8',
    });
    expect(faulted.status).not.toBe(0);
    expect(readFileSync(fixture.receipt, 'utf8')).toBe(before);

    for (let retry = 0; retry < 2; retry += 1) {
      const prepared = spawnSync('bash', [BARRIER, 'prepare-recovery', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });
      expect(prepared.status, prepared.stderr).toBe(0);
      expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
        state: 'recovery_ready_guarded',
        last_command: 'prepare-recovery',
      });
    }
  });

  it.each(['cleanup', 'rollback'] as const)(
    'does not forge a terminal %s receipt after a protected post-COMMIT fault',
    command => {
      const fixture = barrierFixture();
      const committedOperation = join(resolve(fixture.receipt, '..'), `fake-committed-${command}`);
      const result = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: {
          ...fixture.env,
          MC2_Q12_BARRIER_FAULT_POINT: 'before-receipt',
          MC2_Q12_FAKE_COMMITTED_OPERATION: committedOperation,
        },
        encoding: 'utf8',
      });

      expect(result.status).not.toBe(0);
      expect(readFileSync(committedOperation, 'utf8').trim()).toBe(command);
      expect(existsSync(fixture.receipt)).toBe(false);
      expect(readFileSync(fixture.capability, 'utf8').trim()).toBe(CAPABILITY_SENTINEL);
    }
  );
});
