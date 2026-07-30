/* eslint-disable max-lines -- The exhaustive Q12 barrier suite shares one exact durable fixture. */
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
  statSync,
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
const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'q12-local-terminal-proof-password';
const temporaryDirectories: string[] = [];

// The emitted SQL carries load-bearing rationale in `--` comments (mc2-ipwyc explains there why a
// per-relation DROP TRIGGER is impossible). An assertion that a STATEMENT is absent must therefore
// look at the executable lines only, or it matches the very comment that documents the absence.
function executableSql(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
}

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
      // mc2-34eua: cron.job is NOT guarded — production `postgres` can neither LOCK nor
      // CREATE TRIGGER on a supabase_admin-owned relation.
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
  baseline: string;
  cleanupProof: string;
  rollbackProof: string;
  runRoot: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeCanonical(path: string, value: unknown, mode = 0o400): void {
  writeFileSync(path, `${canonicalJson(value)}\n`, { mode });
  chmodSync(path, mode);
}

function prepareTerminalInputs(
  fixture: BarrierFixture,
  operation: 'cleanup' | 'rollback',
  executionEpoch = 'cutover'
): void {
  const expected = JSON.parse(readFileSync(fixture.catalog, 'utf8')) as Record<string, any>;
  const catalogSha =
    fixture.args[fixture.args.indexOf('--expected-post-migration-catalog-sha256') + 1];
  const capabilitySha = sha256(readFileSync(fixture.capability, 'utf8').trim());
  const journal = join(fixture.runRoot, 'phase.jsonl');
  const entries: Array<Record<string, any>> = [];
  let previousHash = '0'.repeat(64);
  const append = (
    phase: string,
    outcome: string,
    leaseEpoch: string,
    capabilityManifestSha256: string
  ): Record<string, any> => {
    const preimage = {
      schema: 'megacampus.q12.cutover-journal/v1',
      run_id: RUN_ID,
      seq: entries.length + 1,
      phase,
      outcome,
      timestamp: `2026-07-14T08:00:${String(entries.length + 1).padStart(2, '0')}.000Z`,
      release_sha: '1'.repeat(40),
      operator_digest: '2'.repeat(64),
      command_id:
        phase === 'guard_cleanup_complete' ? `barrier.${operation}` : 'barrier.prepare-recovery',
      command_sha256: '3'.repeat(64),
      lease_epoch: leaseEpoch,
      previous_hash: previousHash,
      rotation_required: true,
      resource_manifest_sha256: 'b'.repeat(64),
      quiesce_manifest_sha256: '0'.repeat(64),
      capability_manifest_sha256: capabilityManifestSha256,
      accepted_object_kind: 'none',
      accepted_object_sha256: null,
    };
    const entry = { ...preimage, entry_hash: sha256(canonicalJson(preimage)) };
    entries.push(entry);
    previousHash = entry.entry_hash;
    return entry;
  };
  const acceptedPredecessor = append('preflight', 'accepted', 'cutover', '0'.repeat(64));
  const intent = append('guard_cleanup_complete', 'intent', 'cutover', '0'.repeat(64));
  append('guard_cleanup_complete', 'capability_issued', 'cutover', 'c'.repeat(64));
  let claimed = append('guard_cleanup_complete', 'capability_claimed', 'cutover', 'c'.repeat(64));
  if (executionEpoch !== 'cutover') {
    append('guard_cleanup_complete', 'recovery_reacquired', executionEpoch, 'd'.repeat(64));
    claimed = append(
      'guard_cleanup_complete',
      'capability_claimed',
      executionEpoch,
      'd'.repeat(64)
    );
  }
  writeFileSync(journal, `${entries.map(canonicalJson).join('\n')}\n`, { mode: 0o600 });
  chmodSync(journal, 0o600);
  const journalStat = statSync(journal);
  const checkpoint = {
    schema_version: 'megacampus.q12.cutover-checkpoint/v1',
    run_id: RUN_ID,
    seq: claimed.seq,
    phase: 'guard_cleanup_complete',
    journal_entry_hash: claimed.entry_hash,
    previous_journal_entry_hash: claimed.previous_hash,
    journal_device: String(journalStat.dev),
    journal_inode: String(journalStat.ino),
    accepted_object_kind: 'none',
    accepted_object_sha256: null,
    resume_authority_sha256: null,
    lease_epoch: executionEpoch,
  };
  writeCanonical(
    join(fixture.runRoot, `database-barrier-input-checkpoint-${operation}-${executionEpoch}.json`),
    checkpoint,
    0o600
  );
  const capabilityCheckpoint = join(
    fixture.runRoot,
    `database-barrier-capability-checkpoint-${operation}-${executionEpoch}.json`
  );
  writeCanonical(
    capabilityCheckpoint,
    {
      ...checkpoint,
      seq: executionEpoch === 'cutover' ? intent.seq : acceptedPredecessor.seq,
      phase: executionEpoch === 'cutover' ? intent.phase : acceptedPredecessor.phase,
      journal_entry_hash:
        executionEpoch === 'cutover' ? intent.entry_hash : acceptedPredecessor.entry_hash,
      previous_journal_entry_hash:
        executionEpoch === 'cutover' ? intent.previous_hash : acceptedPredecessor.previous_hash,
      lease_epoch: 'cutover',
    },
    0o600
  );
  const baselineProjection = {
    baseline_structural_catalog_sha256: expected.baseline_structural_sha256,
    database_default_sha256: '6'.repeat(64),
    cron_jobs_sha256: '7'.repeat(64),
    guarded_relations_sha256: sha256(canonicalJson(expected.guarded_relations)),
    pg_net_queue_count: 0,
  };
  writeCanonical(fixture.baseline, {
    schema_version: 'megacampus.q12.database-barrier-baseline/v1',
    run_id: RUN_ID,
    state: 'maintenance_guarded_baseline',
    source_baseline_sha256: '8'.repeat(64),
    baseline_sha256: sha256(canonicalJson(baselineProjection)),
    predecessor_checkpoint_sha256: '9'.repeat(64),
    predecessor_journal_entry_hash: 'a'.repeat(64),
    resource_manifest_sha256: 'b'.repeat(64),
    expected_post_migration_catalog_sha256: expected.expected_post_migration_catalog_sha256,
    database_capability_sha256: capabilitySha,
    baseline: baselineProjection,
  });
  const receipt = {
    schema_version: 'megacampus.q12.database-barrier-receipt/v1',
    run_id: RUN_ID,
    state: operation === 'cleanup' ? 'activated' : 'maintenance_guarded',
    zero_guard_residue: false,
    expected_catalog_sha256: catalogSha,
    last_command: operation === 'cleanup' ? 'activate' : 'install',
    rollback_probes_verified: operation === 'cleanup',
    probe_receipt_sha256:
      operation === 'cleanup' ? sha256(readFileSync(fixture.probeReceipt)) : null,
  };
  writeCanonical(fixture.receipt, receipt);
  const archive = join(fixture.runRoot, `database-barrier-receipt-v1-before-${operation}.json`);
  writeFileSync(archive, readFileSync(fixture.receipt), { mode: 0o400 });
  chmodSync(archive, 0o400);
  if (operation === 'rollback') {
    const requiredPhaseReceipts: unknown[] = [];
    writeCanonical(join(fixture.runRoot, 'database-barrier-rollback-intent.json'), {
      schema_version: 'megacampus.q12.database-barrier-rollback-intent/v1',
      run_id: RUN_ID,
      state: 'rollback_intent',
      expected_post_migration_catalog_sha256: expected.expected_post_migration_catalog_sha256,
      database_barrier_baseline_sha256: sha256(readFileSync(fixture.baseline)),
      predecessor_receipt_sha256: sha256(readFileSync(fixture.receipt)),
      input_checkpoint_sha256: sha256(readFileSync(capabilityCheckpoint)),
      intent_journal_entry_hash: intent.entry_hash,
      required_phase_receipts: requiredPhaseReceipts,
      required_phase_receipts_sha256: sha256(canonicalJson(requiredPhaseReceipts)),
    });
  }
}

function terminalChildResult(operation: 'cleanup' | 'rollback'): Record<string, unknown> {
  const catalog = expectedCatalog();
  return {
    structural_catalog_sha256:
      operation === 'cleanup'
        ? catalog.expected_post_migration_catalog_sha256
        : catalog.baseline_structural_sha256,
    database_default_sha256: '6'.repeat(64),
    cron_jobs_sha256: '7'.repeat(64),
    guard_residue: {
      q12_guard_schema_count: 0,
      q12_guard_relation_count: 0,
      q12_guard_function_count: 0,
      q12_guard_type_count: 0,
      q12_guard_trigger_count: 0,
      q12_guard_event_trigger_count: 0,
      barrier_era_session_count: 0,
    },
  };
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
  writeCanonical(
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
  writeCanonical(
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
if [[ "$3" == install && -n "\${MC2_Q12_FAKE_BASELINE_RESULT:-}" ]]; then
  [[ -n "\${13:-}" ]] || exit 83
  printf '%s\n' "$MC2_Q12_FAKE_BASELINE_RESULT" > "\${13}"
fi
if [[ ( "$3" == cleanup || "$3" == rollback ) && -n "\${MC2_Q12_FAKE_TERMINAL_RESULT:-}" ]]; then
  [[ -n "\${14:-}" ]] || exit 84
  printf '%s\n' "$MC2_Q12_FAKE_TERMINAL_RESULT" > "\${14}"
fi
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
    baseline: join(runRoot, 'database-barrier-baseline.json'),
    cleanupProof: join(runRoot, 'database-barrier-cleanup-terminal-proof.json'),
    rollbackProof: join(runRoot, 'database-barrier-rollback-terminal-proof.json'),
    runRoot,
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
  it('publishes the exact immutable eleven-key install baseline before the first v1 receipt', () => {
    const fixture = barrierFixture();

    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const baseline = JSON.parse(readFileSync(fixture.baseline, 'utf8')) as Record<string, any>;
    expect(Object.keys(baseline).sort()).toEqual(
      [
        'schema_version',
        'run_id',
        'state',
        'source_baseline_sha256',
        'baseline_sha256',
        'predecessor_checkpoint_sha256',
        'predecessor_journal_entry_hash',
        'resource_manifest_sha256',
        'expected_post_migration_catalog_sha256',
        'database_capability_sha256',
        'baseline',
      ].sort()
    );
    expect(Object.keys(baseline.baseline).sort()).toEqual(
      [
        'baseline_structural_catalog_sha256',
        'database_default_sha256',
        'cron_jobs_sha256',
        'guarded_relations_sha256',
        'pg_net_queue_count',
      ].sort()
    );
    expect(baseline).toMatchObject({
      schema_version: 'megacampus.q12.database-barrier-baseline/v1',
      run_id: RUN_ID,
      state: 'maintenance_guarded_baseline',
    });
    expect(existsSync(fixture.receipt)).toBe(true);
  });

  it('derives install evidence from the reconnect-verified immutable database baseline', () => {
    const fixture = barrierFixture();
    const catalog = expectedCatalog();
    const projection = {
      baseline_structural_catalog_sha256: catalog.baseline_structural_sha256,
      database_default_sha256: '6'.repeat(64),
      cron_jobs_sha256: '7'.repeat(64),
      guarded_relations_sha256: sha256(canonicalJson(catalog.guarded_relations)),
      pg_net_queue_count: 0,
    };
    const childResult = {
      source_baseline_sha256: '8'.repeat(64),
      baseline: projection,
    };

    const result = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: {
        ...fixture.env,
        MC2_Q12_FAKE_BASELINE_RESULT: canonicalJson(childResult),
      },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(fixture.baseline, 'utf8'))).toMatchObject({
      source_baseline_sha256: childResult.source_baseline_sha256,
      baseline_sha256: sha256(canonicalJson(projection)),
      baseline: projection,
    });
  });

  it.each(['cleanup', 'rollback'] as const)(
    'publishes only the exact eighteen-key %s terminal proof and leaves Root mutations untouched',
    command => {
      const fixture = barrierFixture();
      prepareTerminalInputs(fixture, command);
      const proofPath = command === 'cleanup' ? fixture.cleanupProof : fixture.rollbackProof;
      const predecessorReceipt = readFileSync(fixture.receipt);

      const result = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: {
          ...fixture.env,
          MC2_Q12_FAKE_TERMINAL_RESULT: canonicalJson(terminalChildResult(command)),
        },
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as Record<string, any>;
      expect(Object.keys(proof).sort()).toEqual(
        [
          'schema_version',
          'run_id',
          'operation',
          'state',
          'expected_post_migration_catalog_sha256',
          'database_barrier_baseline_sha256',
          'predecessor_receipt_sha256',
          'predecessor_receipt_archive_sha256',
          'database_barrier_rollback_intent_sha256',
          'input_checkpoint_sha256',
          'intent_journal_entry_hash',
          'structural_catalog_sha256',
          'database_default_sha256',
          'cron_jobs_sha256',
          'guard_residue',
          'required_phase_receipts_sha256',
          'database_capability_sha256',
          'completed_at',
        ].sort()
      );
      expect(proof).toMatchObject({
        schema_version: 'megacampus.q12.database-barrier-terminal-proof/v1',
        run_id: RUN_ID,
        operation: command,
        state: 'guard_cleanup_complete',
      });
      expect(readFileSync(fixture.capability, 'utf8').trim()).toBe(CAPABILITY_SENTINEL);
      expect(readFileSync(fixture.receipt)).toEqual(predecessorReceipt);
    }
  );

  it('accepts an exact cleanup child-input checkpoint in the current recovery epoch', () => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'cleanup', 'cutover-recovery-1');

    const result = spawnSync('bash', [BARRIER, 'cleanup', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(fixture.cleanupProof)).toBe(true);
  });

  it('rejects a corrupt earlier database lifecycle row even when the claimed tail matches', () => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'cleanup');
    const journal = join(fixture.runRoot, 'phase.jsonl');
    const tail = readFileSync(journal, 'utf8');
    writeFileSync(
      journal,
      `${canonicalJson({
        schema: 'megacampus.q12.cutover-journal/v1',
        run_id: RUN_ID,
        seq: 1,
        phase: 'guard_cleanup_complete',
        outcome: 'intent',
        previous_hash: '0'.repeat(64),
        entry_hash: 'f'.repeat(64),
      })}\n${tail}`,
      { mode: 0o600 }
    );

    const result = spawnSync('bash', [BARRIER, 'cleanup', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/journal.*chain|journal.*canonical|lifecycle/iu);
    expect(existsSync(fixture.cleanupProof)).toBe(false);
  });

  it('rejects a rollback predecessor receipt whose state and last_command disagree', () => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'rollback');
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8')) as Record<string, any>;
    receipt.last_command = 'activate';
    chmodSync(fixture.receipt, 0o600);
    writeCanonical(fixture.receipt, receipt);
    const archive = join(fixture.runRoot, 'database-barrier-receipt-v1-before-rollback.json');
    chmodSync(archive, 0o600);
    writeFileSync(archive, readFileSync(fixture.receipt));
    chmodSync(archive, 0o400);

    const result = spawnSync('bash', [BARRIER, 'rollback', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/predecessor receipt|last_command/iu);
    expect(existsSync(fixture.rollbackProof)).toBe(false);
  });

  it.each([
    {
      label: 'cross-wired capability checkpoint',
      mutate: (intent: Record<string, any>) => {
        intent.input_checkpoint_sha256 = 'f'.repeat(64);
      },
    },
    {
      label: 'extra rollback phase receipt',
      mutate: (intent: Record<string, any>) => {
        intent.required_phase_receipts = [
          { phase: 'handoff_rollback_verified', receipt_sha256: '1'.repeat(64) },
        ];
        intent.required_phase_receipts_sha256 = sha256(
          canonicalJson(intent.required_phase_receipts)
        );
      },
    },
  ])('rejects a rollback intent with a $label before database mutation', ({ mutate }) => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'rollback');
    const intentPath = join(fixture.runRoot, 'database-barrier-rollback-intent.json');
    const intent = JSON.parse(readFileSync(intentPath, 'utf8')) as Record<string, any>;
    mutate(intent);
    chmodSync(intentPath, 0o600);
    writeCanonical(intentPath, intent);

    const result = spawnSync('bash', [BARRIER, 'rollback', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/rollback intent|required phase receipt|checkpoint/iu);
    expect(existsSync(fixture.rollbackProof)).toBe(false);
  });

  it('reconstructs a missing baseline and v1 receipt after install COMMIT without replacing the baseline', () => {
    const fixture = barrierFixture();
    const faulted = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: { ...fixture.env, MC2_Q12_BARRIER_FAULT_POINT: 'after-baseline' },
      encoding: 'utf8',
    });
    expect(faulted.status).not.toBe(0);
    expect(existsSync(fixture.baseline)).toBe(true);
    expect(existsSync(fixture.receipt)).toBe(false);
    const baselineBytes = readFileSync(fixture.baseline);

    const recovered = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(recovered.status, recovered.stderr).toBe(0);
    expect(readFileSync(fixture.baseline)).toEqual(baselineBytes);
    expect(JSON.parse(readFileSync(fixture.receipt, 'utf8'))).toMatchObject({
      schema_version: 'megacampus.q12.database-barrier-receipt/v1',
      state: 'maintenance_guarded',
    });
  });

  it('rejects a replaced or extended immutable install baseline', () => {
    const fixture = barrierFixture();
    expect(
      spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      }).status
    ).toBe(0);
    const baseline = JSON.parse(readFileSync(fixture.baseline, 'utf8')) as Record<string, any>;
    baseline.unexpected = true;
    chmodSync(fixture.baseline, 0o600);
    writeCanonical(fixture.baseline, baseline);

    const rejected = spawnSync('bash', [BARRIER, 'install', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toMatch(/baseline.*non-exact|baseline.*invalid/iu);
  });

  it.each(['cleanup', 'rollback'] as const)(
    'reuses an exact durable %s proof after a post-publication crash without replaying the child',
    command => {
      const fixture = barrierFixture();
      prepareTerminalInputs(fixture, command);
      const proofPath = command === 'cleanup' ? fixture.cleanupProof : fixture.rollbackProof;
      const faulted = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: { ...fixture.env, MC2_Q12_BARRIER_FAULT_POINT: 'after-proof' },
        encoding: 'utf8',
      });
      expect(faulted.status).not.toBe(0);
      const proofBytes = readFileSync(proofPath);
      rmSync(fixture.nodeArgsLog, { force: true });

      const recovered = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });

      expect(recovered.status, recovered.stderr).toBe(0);
      expect(readFileSync(proofPath)).toEqual(proofBytes);
      expect(existsSync(fixture.nodeArgsLog)).toBe(false);
      expect(readFileSync(fixture.capability, 'utf8').trim()).toBe(CAPABILITY_SENTINEL);
    }
  );

  it.each(['cleanup', 'rollback'] as const)(
    'rejects a replaced or extended immutable %s terminal proof before child replay',
    command => {
      const fixture = barrierFixture();
      prepareTerminalInputs(fixture, command);
      const proofPath = command === 'cleanup' ? fixture.cleanupProof : fixture.rollbackProof;
      expect(
        spawnSync('bash', [BARRIER, command, ...fixture.args], {
          env: fixture.env,
          encoding: 'utf8',
        }).status
      ).toBe(0);
      const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as Record<string, unknown>;
      proof.unexpected = true;
      chmodSync(proofPath, 0o600);
      writeCanonical(proofPath, proof);
      rmSync(fixture.nodeArgsLog, { force: true });

      const rejected = spawnSync('bash', [BARRIER, command, ...fixture.args], {
        env: fixture.env,
        encoding: 'utf8',
      });

      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toMatch(/terminal proof.*non-exact/iu);
      expect(existsSync(fixture.nodeArgsLog)).toBe(false);
    }
  );

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
    expect(lockStatement).toMatch(
      /"public"\."public_table_00"[\s\S]*"net"\."http_request_queue"[\s\S]*"supabase_migrations"\."schema_migrations"/u
    );
    expect(lockStatement).not.toContain('document_evidence_runs');
    // mc2-34eua: cron.job must never be a lock target. `postgres` cannot take ACCESS EXCLUSIVE on
    // a supabase_admin-owned relation (42501), which failed C1 six times against production.
    expect(lockStatement).not.toContain('"cron"');
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
    // mc2-ipwyc: the guards are disarmed by dropping the guard FUNCTION with CASCADE, never by
    // per-relation DROP TRIGGER — that needs OWNERSHIP of the table, which postgres does not have
    // on the auth/storage relations it is nonetheless allowed to arm.
    expect(sql).toContain('DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE;');
    expect(executableSql(sql)).not.toContain('DROP TRIGGER');
    // The six immutable guards survive activation: their definitions are captured BEFORE the drop
    // and replayed after it, and the count is asserted inside the block.
    expect(sql).toContain('pg_get_triggerdef');
    expect(sql).toContain("t.tgname IN ('q12_guard_immutable','q12_guard_immutable_truncate')");
    expect(sql).toContain('Q12 immutable guard trigger set is not exactly six before restore');
    expect(sql).toContain('FOREACH definition IN ARRAY immutable_definitions');
    expect(sql).toContain('q12_guard_ddl_command_start');
  });

  it('derives rollback locks from base plus only committed migration guard truth at every phase', () => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'rollback');
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
      state: 'maintenance_guarded',
      zero_guard_residue: false,
      rollback_probes_verified: false,
      probe_receipt_sha256: null,
    });
    expect(existsSync(fixture.rollbackProof)).toBe(true);
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
    prepareTerminalInputs(fixture, 'rollback');
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
    // mc2-ipwyc: rollback disarms through the same CASCADE and re-creates NOTHING — the schema is
    // dropped a few statements later. The capture must still precede the drop.
    expect(sql).toContain('DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE;');
    expect(executableSql(sql)).not.toContain('DROP TRIGGER');
    expect(sql.indexOf('pg_get_functiondef')).toBeLessThan(
      sql.indexOf('DROP FUNCTION q12_guard.enforce_write_barrier() CASCADE;')
    );
    // The replay branch is emitted but provably DEAD on rollback: $drop_schema is substituted into
    // the guard, so the rollback SQL literally reads IF 'true'='false'.
    expect(sql).toContain("IF 'true'='false' THEN");
    expect(sql.indexOf("IF 'true'='false' THEN")).toBeLessThan(
      sql.indexOf('FOREACH definition IN ARRAY immutable_definitions')
    );
  });

  it('leaves the fixed capability and v1 receipt for Root after cleanup proves zero residue', () => {
    const fixture = barrierFixture();
    prepareTerminalInputs(fixture, 'cleanup');
    const predecessorReceipt = readFileSync(fixture.receipt);
    const result = spawnSync('bash', [BARRIER, 'cleanup', ...fixture.args], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.capability, 'utf8').trim()).toBe(CAPABILITY_SENTINEL);
    expect(readFileSync(fixture.receipt)).toEqual(predecessorReceipt);
    expect(existsSync(fixture.cleanupProof)).toBe(true);
  });

  it('rejects unknown top-level catalog fields, a seventy-sixth public relation, and a guarded cron relation', () => {
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
      // mc2-34eua: a hand-assembled run-root catalog that guards a cron relation must be refused
      // HERE, before any DB work — not discovered as a 42501 at C1 with ten writers already
      // stopped. Both legs of the frozen assertion are exercised: the count moves off 75 and the
      // cron-schema set is no longer empty.
      (catalog: Record<string, any>) => {
        catalog.guarded_relations.push({
          schema: 'cron',
          name: 'job',
          oid: 999_998,
          relkind: 'r',
          parent_oid: null,
          owner: 'supabase_admin',
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
    prepareTerminalInputs(cleanupFixture, 'cleanup');
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
      prepareTerminalInputs(fixture, command);
      const predecessorReceipt = readFileSync(fixture.receipt);
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
      expect(readFileSync(fixture.receipt)).toEqual(predecessorReceipt);
      expect(existsSync(command === 'cleanup' ? fixture.cleanupProof : fixture.rollbackProof)).toBe(
        false
      );
      expect(readFileSync(fixture.capability, 'utf8').trim()).toBe(CAPABILITY_SENTINEL);
    }
  );
});

describe.runIf(REAL_PG17)(
  'Q12 terminal proof reconnect against disposable PostgreSQL 17.10',
  () => {
    const docker = (args: string[], input?: string) =>
      spawnSync('docker', args, {
        encoding: 'utf8',
        input,
        timeout: 60_000,
      });

    // mc2-38ivn: production reaches PostgreSQL through Supavisor, which REWRITES the startup-packet
    // application_name to 'Supavisor' (measured against the live pooler on 2026-07-28 by window
    // pre-flight probe B3). A PG17 `ON login` event trigger reproduces that shape faithfully in a
    // plain container: it re-sets application_name at session start from the SESSION source, which
    // outranks the startup packet's PGC_S_CLIENT, and is in turn overridden by a later in-session
    // SET -- which is exactly the repair. Without it this leg proves nothing, because a direct
    // connection delivers application_name and the barrier would look correct for the wrong reason.
    const POOLER_REWRITE = `
CREATE FUNCTION public.q12_pooler_rewrite() RETURNS event_trigger LANGUAGE plpgsql AS $rewrite$
BEGIN
  PERFORM set_config('application_name','Supavisor',false);
END;
$rewrite$;
CREATE EVENT TRIGGER q12_pooler_rewrite ON login EXECUTE FUNCTION public.q12_pooler_rewrite();
`;
    const INTRUDER_NAME = 'megacampus-q12-intruder';

    // `%a` puts the application_name the SERVER sees in front of every log line: the same value
    // pg_stat_activity reports, observable after the short-lived proof session is gone.
    const LOG_PREFIX = '%a|';

    // Two cases, one container each. `intruderHeld: false` is the green leg: a real cleanup of an
    // INSTALLED guard, proving the proof names itself under the pooler-rewrite emulation.
    // `intruderHeld: true` is the same run with one badged session held open, proving the count
    // that green leg asserts is live. Running them in one container would have let the green leg
    // clean an already-cleaned database and read the failed run's log lines.
    it.each([{ intruderHeld: false }, { intruderHeld: true }])(
      'drives the protected cleanup seam through the actual terminal reconnect runner (intruder held: $intruderHeld)',
      async ({ intruderHeld }) => {
        const container = `mc2-q12-terminal-${intruderHeld ? 'intruder' : 'clean'}-${process.pid}-${Date.now()}`;
        const started = docker([
          'run',
          '-d',
          '--rm',
          '--name',
          container,
          '-e',
          `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
          '-p',
          '127.0.0.1::5432',
          POSTGRES_IMAGE,
          '-c',
          'log_statement=all',
          '-c',
          `log_line_prefix=${LOG_PREFIX}`,
        ]);
        expect(started.status, started.stderr).toBe(0);

        try {
          let ready = false;
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const logs = docker(['logs', container]);
            const probe = docker([
              'exec',
              container,
              'pg_isready',
              '-U',
              'postgres',
              '-d',
              'postgres',
            ]);
            if (
              probe.status === 0 &&
              logs.stdout.includes('PostgreSQL init process complete; ready for start up.')
            ) {
              ready = true;
              break;
            }
            await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
          }
          expect(ready, docker(['logs', container]).stdout).toBe(true);

          const setup = docker(
            ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
            `
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(
  version text PRIMARY KEY,
  name text,
  statements text[]
);
CREATE SCHEMA cron;
CREATE TABLE cron.job(
  jobid bigint PRIMARY KEY,
  schedule text NOT NULL,
  command text NOT NULL,
  nodename text NOT NULL,
  nodeport integer NOT NULL,
  database text NOT NULL,
  username text NOT NULL,
  active boolean NOT NULL,
  jobname text
);
INSERT INTO cron.job(jobid,schedule,command,nodename,nodeport,database,username,active,jobname)
SELECT value,'0 * * * *','SELECT ' || value,'localhost',5432,'postgres','postgres',true,
       'q12_job_' || value
FROM generate_series(1,8) AS value;
${POOLER_REWRITE}
`
          );
          expect(setup.status, setup.stderr).toBe(0);

          // The emulation is real before anything depends on it: a fresh session that ASKS for a Q12
          // name still reports 'Supavisor', and only an in-session SET moves it.
          const rewriteProof = docker(
            [
              'exec',
              '-e',
              'PGAPPNAME=megacampus-q12-asked-at-connect',
              '-i',
              container,
              'psql',
              '-X',
              '-q',
              '-At',
              '-v',
              'ON_ERROR_STOP=1',
              '-U',
              'postgres',
            ],
            `SELECT current_setting('application_name');
SET application_name='megacampus-q12-rewrite-probe';
SELECT current_setting('application_name');
`
          );
          expect(rewriteProof.status, rewriteProof.stderr).toBe(0);
          expect(rewriteProof.stdout.trim().split('\n')).toEqual([
            'Supavisor',
            'megacampus-q12-rewrite-probe',
          ]);

          const structuralSql = readFileSync(STRUCTURAL_CATALOG, 'utf8').trim();
          const structural = docker(
            [
              'exec',
              '-i',
              container,
              'psql',
              '-X',
              '-At',
              '-v',
              'ON_ERROR_STOP=1',
              '-U',
              'postgres',
            ],
            `SELECT structural_sha256 FROM (\n${structuralSql}\n) AS terminal_catalog;\n`
          );
          expect(structural.status, structural.stderr).toBe(0);
          const structuralSha256 = structural.stdout.trim();
          expect(structuralSha256).toMatch(/^[a-f0-9]{64}$/u);

          const cronProjection = Array.from({ length: 8 }, (_, index) => {
            const jobid = index + 1;
            return {
              jobid,
              jobname: `q12_job_${jobid}`,
              schedule: '0 * * * *',
              command_sha256: sha256(`SELECT ${jobid}`),
              nodename: 'localhost',
              nodeport: 5432,
              database: 'postgres',
              username: 'postgres',
              active: true,
            };
          });
          const databaseDefault = {
            schema_version: 'megacampus.q12.database-default/v1',
            database: 'postgres',
            role: null,
            row_present: false,
            settings: [],
          };
          const fixture = barrierFixture();
          rewriteExpectedCatalog(fixture, catalog => {
            catalog.baseline_structural_sha256 = structuralSha256;
            catalog.expected_post_migration_catalog_sha256 = structuralSha256;
            catalog.migrations['20260711151000'].catalog_sha256 = structuralSha256;
          });
          const expectedCatalogSha256 =
            fixture.args[fixture.args.indexOf('--expected-post-migration-catalog-sha256') + 1];
          const probeReceipt = JSON.parse(readFileSync(fixture.probeReceipt, 'utf8')) as Record<
            string,
            unknown
          >;
          probeReceipt.expected_catalog_sha256 = expectedCatalogSha256;
          chmodSync(fixture.probeReceipt, 0o600);
          writeCanonical(fixture.probeReceipt, probeReceipt);
          prepareTerminalInputs(fixture, 'cleanup');

          const baseline = JSON.parse(readFileSync(fixture.baseline, 'utf8')) as Record<
            string,
            any
          >;
          baseline.baseline.database_default_sha256 = sha256(canonicalJson(databaseDefault));
          baseline.baseline.cron_jobs_sha256 = sha256(canonicalJson(cronProjection));
          baseline.baseline_sha256 = sha256(canonicalJson(baseline.baseline));
          chmodSync(fixture.baseline, 0o600);
          writeCanonical(fixture.baseline, baseline);

          const publishedPort = docker(['port', container, '5432/tcp']);
          expect(publishedPort.status, publishedPort.stderr).toBe(0);
          const port = publishedPort.stdout.trim().match(/:(\d+)$/u)?.[1];
          expect(port).toMatch(/^\d+$/u);
          writeFileSync(
            fixture.dbUrl,
            `postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${port}/postgres\n`
          );
          chmodSync(fixture.dbUrl, 0o600);

          const testRoot = fixture.env.MC2_Q12_BARRIER_TEST_ROOT as string;
          const terminalNode = join(testRoot, 'terminal-node');
          const terminalInvocationLog = join(testRoot, 'terminal-node-invoked.log');
          writeFileSync(
            terminalNode,
            `#!/usr/bin/env bash
set -euo pipefail
{
  printf 'invoked url_fd=%s\\n' "$3"
  readlink "/proc/self/fd/$3"
  cat "/proc/self/fdinfo/$3"
} > "$MC2_Q12_REAL_TERMINAL_NODE_LOG"
exec node "$@"
`,
            { mode: 0o700 }
          );
          chmodSync(terminalNode, 0o700);

          const runCleanup = () =>
            spawnSync('bash', [BARRIER, 'cleanup', ...fixture.args], {
              env: {
                ...fixture.env,
                MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY: REPO_ROOT,
                MC2_Q12_BARRIER_TEST_REAL_RECONNECT: 'mc2-local-pg17-terminal-reconnect-only',
                MC2_Q12_BARRIER_TEST_TERMINAL_NODE: terminalNode,
                MC2_Q12_REAL_TERMINAL_NODE_LOG: terminalInvocationLog,
              },
              encoding: 'utf8',
              timeout: 60_000,
            });

          const countSessions = (name: string) =>
            docker([
              'exec',
              container,
              'psql',
              '-X',
              '-q',
              '-At',
              '-U',
              'postgres',
              '-c',
              `SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}'`,
            ]).stdout.trim();

          if (intruderHeld) {
            // A barrier-era session that outlives the window must be VISIBLE to the terminal proof.
            // Through the pooler `barrier_era_session_count` could only ever read 0 -- it passed for
            // the wrong reason (mc2-38ivn). This case holds one badged session open and requires the
            // terminal proof to refuse, which is the other half of the two-way mutation: the case
            // below is byte-for-byte the same run WITHOUT the intruder, and it succeeds.
            const intruder = docker([
              'exec',
              '-d',
              container,
              'psql',
              '-X',
              '-v',
              'ON_ERROR_STOP=1',
              '-U',
              'postgres',
              '-c',
              `SET application_name='${INTRUDER_NAME}'`,
              '-c',
              'SELECT pg_sleep(120)',
            ]);
            expect(intruder.status, intruder.stderr).toBe(0);
            let intruderVisible = false;
            for (let attempt = 0; attempt < 100; attempt += 1) {
              if (countSessions(INTRUDER_NAME) === '1') {
                intruderVisible = true;
                break;
              }
              await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
            }
            expect(intruderVisible).toBe(true);

            const refused = runCleanup();
            expect(refused.status, refused.stdout).not.toBe(0);
            expect(refused.stderr).toContain('database terminal reconnect result is invalid');
            expect(existsSync(fixture.cleanupProof)).toBe(false);
            // The refusal is about the intruder, not about the proof failing to name itself: its own
            // session still reached pg_stat_activity under the Q12 name.
            const refusalLog = docker(['logs', container]);
            expect(`${refusalLog.stdout}${refusalLog.stderr}`).toContain(
              'megacampus-q12-database-terminal-proof|LOG:'
            );
            expect(`${refusalLog.stdout}${refusalLog.stderr}`).toContain(`${INTRUDER_NAME}|LOG:`);
            return;
          }

          const result = runCleanup();

          expect(
            result.status,
            `${result.stderr}\n${readFileSync(terminalInvocationLog, 'utf8')}`
          ).toBe(0);
          expect(readFileSync(terminalInvocationLog, 'utf8')).toMatch(/^invoked url_fd=\d+\n/u);
          expect(JSON.parse(readFileSync(fixture.cleanupProof, 'utf8'))).toMatchObject({
            structural_catalog_sha256: structuralSha256,
            database_default_sha256: sha256(canonicalJson(databaseDefault)),
            cron_jobs_sha256: sha256(canonicalJson(cronProjection)),
            guard_residue: {
              q12_guard_schema_count: 0,
              q12_guard_relation_count: 0,
              q12_guard_function_count: 0,
              q12_guard_type_count: 0,
              q12_guard_trigger_count: 0,
              q12_guard_event_trigger_count: 0,
              barrier_era_session_count: 0,
            },
          });

          // The decisive assertion for mc2-38ivn. `log_line_prefix=%a` records the application_name
          // the SERVER resolved -- the same value pg_stat_activity publishes. Under the pooler-rewrite
          // emulation this can only carry the Q12 name if the terminal proof STATED it in its own
          // session; a runner that trusts the connection is logged as 'Supavisor' and is invisible to
          // every consumer of the `megacampus-q12-%` prefix, including the count asserted above.
          const serverLog = docker(['logs', container]);
          const logText = `${serverLog.stdout}${serverLog.stderr}`;
          expect(logText).toContain('megacampus-q12-database-terminal-proof|LOG:');
          expect(logText).not.toContain(`${INTRUDER_NAME}|LOG:`);
        } finally {
          docker(['rm', '-f', container]);
        }
      },
      240_000
    );
  }
);
