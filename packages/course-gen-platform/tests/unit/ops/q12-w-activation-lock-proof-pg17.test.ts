// Mechanical proof (D6 activation-truth contract line 162) that the accepted-W
// activate NORMAL slice acquires an incompatible ACCESS EXCLUSIVE lock on the full
// guarded catalog BEFORE any tenant-controlled mutation, that the lock conflicts
// with the probe's SHARE, and that no branch bypasses the common-lock predecessor.
// Catalog-independent invariant: proven here over the accepted-W test-reference
// catalog, but the control-flow property holds for any catalog.
//
// Gated behind MC2_Q12_REAL_PG17=1 (disposable postgres:17.10-bookworm), matching
// q12-structural-catalog-pg17.test.ts. Additive; the barrier script is untouched.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const BARRIER = resolve(REPO_ROOT, 'deploy/qdrant/q12-database-barrier.sh');
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'q12-local-pg17-fixture-only';
const CONTAINER = `mc2-q12-lockproof-${process.pid}-${Date.now()}`;
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Accepted-W reference catalog (verbatim from q12-database-barrier.test.ts).
function expectedCatalog(): Record<string, unknown> {
  const publicRelations = Array.from({ length: 47 }, (_, i) => ({
    schema: 'public',
    name: `public_table_${String(i).padStart(2, '0')}`,
    oid: 100 + i,
    relkind: i === 0 ? 'p' : 'r',
    parent_oid: i === 1 ? 100 : null,
    owner: 'postgres',
  }));
  const authRelations = Array.from({ length: 22 }, (_, i) => ({
    schema: 'auth',
    name: `auth_table_${String(i).padStart(2, '0')}`,
    oid: 200 + i,
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
  ].map((name, i) => ({
    schema: 'storage',
    name,
    oid: 300 + i,
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
      { schema: 'cron', name: 'job', oid: 400, relkind: 'r', parent_oid: null, owner: 'postgres' },
      {
        schema: 'net',
        name: 'http_request_queue',
        oid: 401,
        relkind: 'r',
        parent_oid: null,
        owner: 'postgres',
      },
    ],
    cron_jobs: Array.from({ length: 8 }, (_, i) => ({
      jobid: i + 1,
      username: 'postgres',
      command_sha256: String(i).repeat(64),
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

function canonicalFile(path: string, value: unknown, mode: number): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { mode });
}

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error('activation markers not found');
  return value.slice(startIndex + start.length, endIndex);
}

// Generate the activate NORMAL slice from the accepted barrier bytes via the same
// fake-node fixture the accepted-W suite uses (node just copies sqlPath to SQL_LOG).
function generateActivateNormalSlice(): string {
  const root = mkdtempSync('/tmp/mc2-q12-barrier-');
  const secrets = join(root, 'secrets');
  const runRoot = join(root, 'backups/q12', RUN_ID);
  const runSecrets = join(runRoot, 'secrets');
  for (const directory of [
    join(root, 'project/packages/course-gen-platform'),
    secrets,
    runRoot,
    runSecrets,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  chmodSync(root, 0o700);
  const dbUrl = join(secrets, 'supabase_db_url');
  const ca = join(secrets, 'prod-ca.crt');
  const capability = join(runSecrets, 'db-capability');
  const catalog = join(runRoot, 'expected-catalog.json');
  writeFileSync(
    dbUrl,
    'postgresql://postgres.diqooqbuchsliypgwksu:q12-uri-password-synthetic-sentinel@aws-1-us-east-2.pooler.supabase.com:5432/postgres\n',
    { mode: 0o600 }
  );
  canonicalFile(
    join(runRoot, 'database-barrier-input-checkpoint-install-cutover.json'),
    {
      schema_version: 'megacampus.q12.cutover-checkpoint/v1',
      run_id: RUN_ID,
      seq: 3,
      phase: 'maintenance_guarded',
      journal_entry_hash: '1'.repeat(64),
      previous_journal_entry_hash: '0'.repeat(64),
      journal_device: '1',
      journal_inode: '1',
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
      resume_authority_sha256: null,
      lease_epoch: 'cutover',
    },
    0o600
  );
  canonicalFile(
    join(runRoot, 'phase.jsonl'),
    {
      schema: 'megacampus.q12.cutover-journal/v1',
      run_id: RUN_ID,
      seq: 3,
      phase: 'maintenance_guarded',
      outcome: 'capability_claimed',
      timestamp: '2026-07-14T07:00:00.000Z',
      release_sha: '1'.repeat(40),
      operator_digest: '2'.repeat(64),
      command_id: 'barrier.install',
      command_sha256: '3'.repeat(64),
      lease_epoch: 'cutover',
      previous_hash: '0'.repeat(64),
      entry_hash: '1'.repeat(64),
      rotation_required: true,
      resource_manifest_sha256: 'd'.repeat(64),
      quiesce_manifest_sha256: '0'.repeat(64),
      capability_manifest_sha256: 'c'.repeat(64),
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
    },
    0o600
  );
  writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
  writeFileSync(capability, 'q12-capability-synthetic-sentinel\n', { mode: 0o400 });
  // Catalog-parametric: defaults to the accepted-W test-reference catalog; at the
  // live re-freeze boundary, MC2_Q12_ACTIVATION_CATALOG_FILE points to the accepted
  // production expected-post-migration-catalog so the same invariant runs unchanged.
  const catalogOverride = process.env.MC2_Q12_ACTIVATION_CATALOG_FILE;
  const catalogBody = catalogOverride
    ? readFileSync(catalogOverride, 'utf8')
    : `${JSON.stringify(expectedCatalog(), null, 2)}\n`;
  writeFileSync(catalog, catalogBody, { mode: 0o400 });
  const catalogSha = createHash('sha256').update(catalogBody).digest('hex');
  writeFileSync(
    join(runRoot, 'database-barrier-probe-receipt.json'),
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
  const sqlLog = join(root, 'sql.log');
  writeFileSync(fakeNode, '#!/usr/bin/env bash\nset -euo pipefail\ncp -- "$8" "$SQL_LOG"\n', {
    mode: 0o700,
  });
  const result = spawnSync(
    'bash',
    [
      BARRIER,
      'activate',
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
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        MC2_Q12_BARRIER_TEST_MODE: 'mc2-synthetic-q12-database-barrier-test-only',
        MC2_Q12_BARRIER_TEST_ROOT: root,
        MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY: join(root, 'project'),
        MC2_Q12_BARRIER_TEST_NODE: fakeNode,
        NODE_ARGS_LOG: join(root, 'node-args.log'),
        NODE_ENV_LOG: join(root, 'node-env.log'),
        SQL_LOG: sqlLog,
      },
    }
  );
  expect(result.status, result.stderr).toBe(0);
  const sql = readFileSync(sqlLog, 'utf8');
  return between(sql, '-- Q12_ACTIVATE_NORMAL_BEGIN', '-- Q12_ACTIVATE_NORMAL_END');
}

const normalSlice = generateActivateNormalSlice();
const lockMatch = normalSlice.match(/LOCK TABLE ([\s\S]*?) IN ACCESS EXCLUSIVE MODE;/);
const lockedRelations = lockMatch![1].split(',').map(token => token.trim().replace(/"/g, ''));

function docker(args: string[], input?: string, timeout = 120_000): CommandResult {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function psqlResult(sql: string, appName = 'q12-lockproof'): CommandResult {
  return docker(
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${POSTGRES_PASSWORD}`,
      '-e',
      `PGAPPNAME=${appName}`,
      CONTAINER,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
    ],
    `${sql.trim()}\n`
  );
}

function psql(sql: string, appName = 'q12-lockproof'): string {
  const result = psqlResult(sql, appName);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

describe('Q12 accepted-W activation common-lock control-flow (structural)', () => {
  it('places the ACCESS EXCLUSIVE common lock before any tenant mutation with no bypassing branch', () => {
    const lockIndex = normalSlice.indexOf('LOCK TABLE');
    const bindingIndex = normalSlice.indexOf('q12_guard.assert_controller_binding()');
    const guardIndex = normalSlice.indexOf('q12_guard.verify_expected_guards');
    const mutationIndex = normalSlice.indexOf('DO $restore$');
    const alterIndex = normalSlice.indexOf(
      'ALTER DATABASE postgres SET default_transaction_read_only='
    );
    // controller binding, then the common lock, then guard verification, then mutation.
    expect(bindingIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(bindingIndex);
    expect(guardIndex).toBeGreaterThan(lockIndex);
    expect(mutationIndex).toBeGreaterThan(lockIndex);
    expect(alterIndex).toBeGreaterThan(lockIndex);
    // Single linear path: exactly one LOCK TABLE and no branching (no IF/CASE/EXCEPTION)
    // between statement start and the lock — nothing can reach a mutation first.
    expect(normalSlice.match(/LOCK TABLE/g)).toHaveLength(1);
    expect(normalSlice.slice(0, lockIndex)).not.toMatch(/\bIF\b|\bCASE\b|\bEXCEPTION\b|\bLOOP\b/);
    expect(lockMatch![0]).toContain('IN ACCESS EXCLUSIVE MODE');
    expect(lockedRelations.length).toBeGreaterThan(0);
  });
});

describe.runIf(REAL_PG17)(
  'Q12 accepted-W activation common-lock proof against real PostgreSQL 17.10',
  () => {
    beforeAll(async () => {
      const started = docker([
        'run',
        '-d',
        '--rm',
        '--name',
        CONTAINER,
        '-e',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        POSTGRES_IMAGE,
        '-c',
        'wal_level=logical',
      ]);
      expect(started.status, started.stderr).toBe(0);
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const probe = psqlResult("SELECT current_setting('server_version_num')");
        if (probe.status === 0 && probe.stdout.trim().startsWith('17')) {
          ready = true;
          break;
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
      }
      expect(ready, docker(['logs', CONTAINER]).stdout).toBe(true);
      // Materialize every guarded relation the accepted slice locks, in its schema.
      const schemas = [...new Set(lockedRelations.map(relation => relation.split('.')[0]))];
      const createSchemas = schemas
        .map(schema => `CREATE SCHEMA IF NOT EXISTS "${schema}";`)
        .join('\n');
      const createTables = lockedRelations
        .map(relation => {
          const [schema, name] = relation.split('.');
          return `CREATE TABLE "${schema}"."${name}"();`;
        })
        .join('\n');
      psql(`${createSchemas}\n${createTables}`);
    }, 180_000);

    afterAll(() => {
      docker(['rm', '-f', CONTAINER], undefined, 30_000);
    });

    it('acquires ACCESS EXCLUSIVE on the full guarded catalog and conflicts with a concurrent SHARE', async () => {
      // Controller session: acquire the exact accepted LOCK TABLE, then hold it open.
      const controller = spawn(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          `PGPASSWORD=${POSTGRES_PASSWORD}`,
          '-e',
          'PGAPPNAME=q12-activation-controller',
          CONTAINER,
          'psql',
          '-X',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-At',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      let controllerOut = '';
      controller.stdout.setEncoding('utf8');
      controller.stderr.setEncoding('utf8');
      controller.stdout.on('data', chunk => (controllerOut += chunk));
      controller.stderr.on('data', chunk => (controllerOut += chunk));
      controller.stdin.end(
        `BEGIN ISOLATION LEVEL READ COMMITTED;\nSET LOCAL search_path=pg_catalog;\n${lockMatch![0]}\nSELECT 'Q12_LOCK_HELD';\nSELECT pg_sleep(6);\nCOMMIT;\n`
      );
      const lockStarted = Date.now();
      while (!controllerOut.includes('Q12_LOCK_HELD')) {
        if (controller.exitCode !== null)
          throw new Error(`controller exited early: ${controllerOut}`);
        if (Date.now() - lockStarted > 20_000) {
          controller.kill('SIGKILL');
          throw new Error(`controller never reported the lock: ${controllerOut}`);
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
      }

      // pg_locks: the controller holds AccessExclusiveLock on every guarded relation.
      const held = psql(
        `SELECT count(*) FROM pg_locks l
         JOIN pg_class c ON c.oid = l.relation
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE a.application_name = 'q12-activation-controller'
          AND l.locktype = 'relation' AND l.mode = 'AccessExclusiveLock'
          AND n.nspname || '.' || c.relname = ANY($$${'{' + lockedRelations.join(',') + '}'}$$::text[])`
      );
      expect(Number(held)).toBe(lockedRelations.length);

      // A concurrent SHARE on a guarded relation conflicts with ACCESS EXCLUSIVE.
      const target = lockedRelations[0];
      const [targetSchema, targetName] = target.split('.');
      const share = psqlResult(
        `SET lock_timeout='1500ms';\nBEGIN;\nLOCK TABLE "${targetSchema}"."${targetName}" IN SHARE MODE;\nSELECT 'Q12_SHARE_ACQUIRED';\nROLLBACK;`,
        'q12-probe-share'
      );
      expect(share.status).not.toBe(0);
      expect(`${share.stdout}${share.stderr}`).toMatch(/lock timeout|canceling statement/i);
      expect(`${share.stdout}${share.stderr}`).not.toContain('Q12_SHARE_ACQUIRED');

      await new Promise<void>(resolveWait => controller.on('close', () => resolveWait()));
      expect(controllerOut).toContain('Q12_LOCK_HELD');
    }, 60_000);
  }
);
