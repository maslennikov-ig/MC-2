'use strict';
// Reproduction tool for the accepted-W activation tuple (task mc2-jz6y0.13.10).
// Derives fields 5-10 from the accepted barrier bytes at HEAD by faithfully
// replaying the q12-database-barrier.sh activate SQL generation (fields 5-7),
// extracting the ACCESS EXCLUSIVE lock list from the normal slice (fields 8-9),
// and freezing the managed-session-inventory schema (field 10).
//
// Run from the repo root of the accepted-W worktree:
//   node .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs
//
// Determination (see the artifact "Risks / Follow-ups"): fields 5/6/8/9 embed the
// relations of the expected-post-migration-catalog INPUT; this tool uses the
// accepted-W test-suite reference catalog from q12-database-barrier.test.ts, the
// only catalog present in accepted-W bytes. Field 7 and the control-flow invariant
// are catalog-independent.
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } = require('fs');
const { join, resolve } = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');

const REPO = resolve(__dirname, '../../../..');
const BARRIER = resolve(REPO, 'deploy/qdrant/q12-database-barrier.sh');
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const CAPABILITY_SENTINEL = 'q12-capability-synthetic-sentinel';
const URI_PASSWORD_SENTINEL = 'q12-uri-password-synthetic-sentinel';
const D3_SOURCE_DECISION_SHA256 = '7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27';
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');

// Verbatim from q12-database-barrier.test.ts expectedCatalog() (accepted-W reference catalog).
function expectedCatalog() {
  const publicRelations = Array.from({ length: 47 }, (_, i) => ({ schema: 'public', name: `public_table_${String(i).padStart(2, '0')}`, oid: 100 + i, relkind: i === 0 ? 'p' : 'r', parent_oid: i === 1 ? 100 : null, owner: 'postgres' }));
  const authRelations = Array.from({ length: 22 }, (_, i) => ({ schema: 'auth', name: `auth_table_${String(i).padStart(2, '0')}`, oid: 200 + i, relkind: 'r', parent_oid: null, owner: 'postgres' }));
  const storageRelations = ['buckets', 'buckets_analytics', 'objects', 's3_multipart_uploads', 's3_multipart_uploads_parts'].map((name, i) => ({ schema: 'storage', name, oid: 300 + i, relkind: 'r', parent_oid: null, owner: 'postgres' }));
  return {
    schema_version: 'megacampus.q12.expected-post-migration-catalog/v1', database: 'postgres', database_owner: 'postgres', release_sha: '1'.repeat(40),
    migration_frontier: '20260704150249', baseline_structural_sha256: 'a'.repeat(64), expected_post_migration_catalog_sha256: 'b'.repeat(64),
    inventory_counts: { public: 47, auth: 22, storage: 5, cron_jobs: 8, pg_net_queue: 0 },
    guarded_relations: [...publicRelations, ...authRelations, ...storageRelations, { schema: 'cron', name: 'job', oid: 400, relkind: 'r', parent_oid: null, owner: 'postgres' }, { schema: 'net', name: 'http_request_queue', oid: 401, relkind: 'r', parent_oid: null, owner: 'postgres' }],
    cron_jobs: Array.from({ length: 8 }, (_, i) => ({ jobid: i + 1, username: 'postgres', command_sha256: String(i).repeat(64) })),
    migrations: {
      '20260711140000': { catalog_sha256: 'c'.repeat(64), migration_file_sha256: 'e'.repeat(64), relations: [{ schema: 'public', name: 'document_evidence_runs', relkind: 'r', parent_schema: null, parent_name: null, owner: 'postgres' }] },
      '20260711151000': { catalog_sha256: 'b'.repeat(64), migration_file_sha256: 'f'.repeat(64), relations: [{ schema: 'public', name: 'document_evidence_observability_totals', relkind: 'r', parent_schema: null, parent_name: null, owner: 'postgres' }] },
    },
  };
}
const canon = (v, mode, path) => writeFileSync(path, `${JSON.stringify(v)}\n`, { mode });
function between(value, start, end) {
  const s = value.indexOf(start), e = value.indexOf(end, s + start.length);
  if (s < 0 || e < 0) throw new Error('markers');
  return value.slice(s + start.length, e);
}

const root = mkdtempSync('/tmp/mc2-q12-barrier-');
chmodSync(root, 0o700);
const secrets = join(root, 'secrets'), runRoot = join(root, 'backups/q12', RUN_ID), runSecrets = join(runRoot, 'secrets');
for (const d of [join(root, 'project/packages/course-gen-platform'), secrets, runRoot, runSecrets]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
const dbUrl = join(secrets, 'supabase_db_url'), ca = join(secrets, 'prod-ca.crt'), capability = join(runSecrets, 'db-capability'), catalog = join(runRoot, 'expected-catalog.json');
writeFileSync(dbUrl, `postgresql://postgres.diqooqbuchsliypgwksu:${URI_PASSWORD_SENTINEL}@aws-1-us-east-2.pooler.supabase.com:5432/postgres\n`, { mode: 0o600 });
canon({ schema_version: 'megacampus.q12.cutover-checkpoint/v1', run_id: RUN_ID, seq: 3, phase: 'maintenance_guarded', journal_entry_hash: '1'.repeat(64), previous_journal_entry_hash: '0'.repeat(64), journal_device: '1', journal_inode: '1', accepted_object_kind: 'none', accepted_object_sha256: null, resume_authority_sha256: null, lease_epoch: 'cutover' }, 0o600, join(runRoot, 'database-barrier-input-checkpoint-install-cutover.json'));
canon({ schema: 'megacampus.q12.cutover-journal/v1', run_id: RUN_ID, seq: 3, phase: 'maintenance_guarded', outcome: 'capability_claimed', timestamp: '2026-07-14T07:00:00.000Z', release_sha: '1'.repeat(40), operator_digest: '2'.repeat(64), command_id: 'barrier.install', command_sha256: '3'.repeat(64), lease_epoch: 'cutover', previous_hash: '0'.repeat(64), entry_hash: '1'.repeat(64), rotation_required: true, resource_manifest_sha256: 'd'.repeat(64), quiesce_manifest_sha256: '0'.repeat(64), capability_manifest_sha256: 'c'.repeat(64), accepted_object_kind: 'none', accepted_object_sha256: null }, 0o600, join(runRoot, 'phase.jsonl'));
writeFileSync(ca, 'synthetic-ca\n', { mode: 0o644 });
writeFileSync(capability, `${CAPABILITY_SENTINEL}\n`, { mode: 0o400 });
const catalogBody = `${JSON.stringify(expectedCatalog(), null, 2)}\n`;
writeFileSync(catalog, catalogBody, { mode: 0o400 });
const catalogSha = createHash('sha256').update(catalogBody).digest('hex');
writeFileSync(join(runRoot, 'database-barrier-probe-receipt.json'), `${JSON.stringify({ schema_version: 'megacampus.q12.database-barrier-probes/v1', run_id: RUN_ID, expected_catalog_sha256: catalogSha, completed_at: '2026-07-13T12:00:00.000Z', probes: { postgrest_anon: 'rejected', postgrest_authenticated: 'rejected', postgrest_service_role_without_capability: 'rejected', postgrest_service_role_with_capability: 'rolled_back', postgrest_preference_applied: 'tx=rollback', auth_profile: 'rejected_zero_residue', storage_object: 'rejected_zero_metadata_zero_bytes', cron_rpc: 'rejected_exact_jobs_unchanged', pg_net_rpc: 'rejected_zero_queue_zero_external_request', direct_supervisor: 'rolled_back' }, residue: { guard_probe_rows: 0, auth_rows: 0, storage_metadata_rows: 0, storage_object_bytes: 0, cron_job_set_unchanged: true, pg_net_queue_rows: 0, external_requests: 0 } })}\n`, { mode: 0o400 });
const fakeNode = join(root, 'fake-node'), sqlLog = join(root, 'sql.log');
writeFileSync(fakeNode, '#!/usr/bin/env bash\nset -euo pipefail\ncp -- "$8" "$SQL_LOG"\n', { mode: 0o700 });
const env = { PATH: process.env.PATH, MC2_Q12_BARRIER_TEST_MODE: 'mc2-synthetic-q12-database-barrier-test-only', MC2_Q12_BARRIER_TEST_ROOT: root, MC2_Q12_BARRIER_TEST_PROJECT_DIRECTORY: join(root, 'project'), MC2_Q12_BARRIER_TEST_NODE: fakeNode, NODE_ARGS_LOG: join(root, 'node-args.log'), NODE_ENV_LOG: join(root, 'node-env.log'), SQL_LOG: sqlLog };
const res = spawnSync('bash', [BARRIER, 'activate', '--run-id', RUN_ID, '--db-url-file', dbUrl, '--ca-file', ca, '--q12-db-capability-file', capability, '--expected-post-migration-catalog', catalog, '--expected-post-migration-catalog-sha256', catalogSha], { env, encoding: 'utf8' });
if (res.status !== 0) { process.stderr.write(res.stderr || ''); throw new Error('barrier activate failed'); }

const sql = readFileSync(sqlLog, 'utf8');
const normal = between(sql, '-- Q12_ACTIVATE_NORMAL_BEGIN', '-- Q12_ACTIVATE_NORMAL_END');
const recovery = between(sql, '-- Q12_ACTIVATE_RECOVERY_BEGIN', '-- Q12_ACTIVATE_RECOVERY_END');
const order = normal.match(/LOCK TABLE ([\s\S]*?) IN ACCESS EXCLUSIVE MODE;/)[1].split(',').map(s => s.trim().replace(/"/g, ''));
const catalogSet = [...order].sort((a, b) => a.localeCompare(b));
const orderBytes = JSON.stringify({ schema_version: 'megacampus.q12.activation-lock-order/v1', lock_mode: 'ACCESS EXCLUSIVE', relations: order }, null, 2) + '\n';
const catalogBytes = JSON.stringify({ schema_version: 'megacampus.q12.activation-lock-catalog/v1', lock_mode: 'ACCESS EXCLUSIVE', relations: catalogSet }, null, 2) + '\n';
const schemaBytes = JSON.stringify({ schema_version: 'megacampus.q12.managed-session-inventory/v1', top_level_keys: ['schema_version', 'project_ref', 'database', 'source_decision_sha256', 'provider_plane_trusted', 'identities'], fixed_scalars: { project_ref: 'diqooqbuchsliypgwksu', database: 'postgres', source_decision_sha256: D3_SOURCE_DECISION_SHA256, provider_plane_trusted: true }, identity_item_keys: ['role', 'database', 'backend_type', 'application_identity', 'client_class', 'allowed_states', 'transaction_free_required'], identity_sort: 'byte-ascending by the first five identity fields' }, null, 2) + '\n';

// Emit the tracked assets (idempotent): catalog-bound ones carry an explicit
// .test-reference suffix so they cannot be mistaken for production; the schema
// asset is catalog-independent and gets a normal name.
const { writeFileSync: writeAsset } = require('fs');
const assetsDir = resolve(REPO, 'deploy/qdrant');
writeAsset(join(assetsDir, 'q12-activation-lock-order.test-reference.json'), orderBytes);
writeAsset(join(assetsDir, 'q12-activation-lock-catalog.test-reference.json'), catalogBytes);
writeAsset(join(assetsDir, 'q12-managed-session-inventory-schema.json'), schemaBytes);

process.stdout.write(`run_id/catalog-embedded in SQL? run_id=${sql.includes(RUN_ID)} catalog_sha=${sql.includes(catalogSha)} (both false => barrier-byte deterministic; re-freeze is pure catalog substitution)\n`);
process.stdout.write(`5 activation_sql_projection_sha256   = ${sha(sql)}  (${Buffer.byteLength(sql)} bytes, TEST-CATALOG-bound)\n`);
process.stdout.write(`6 activation_normal_slice_sha256     = ${sha(normal)}  (${Buffer.byteLength(normal)} bytes, TEST-CATALOG-bound)\n`);
process.stdout.write(`7 activation_recovery_slice_sha256   = ${sha(recovery)}  (${Buffer.byteLength(recovery)} bytes, catalog-INDEPENDENT)\n`);
process.stdout.write(`8 activation_lock_catalog_sha256     = ${sha(catalogBytes)}  (${order.length} relations, TEST-CATALOG-bound)\n`);
process.stdout.write(`9 activation_lock_order_sha256       = ${sha(orderBytes)}  (TEST-CATALOG-bound)\n`);
process.stdout.write(`10 managed_inventory_schema_sha256   = ${sha(schemaBytes)}  (determination-flagged canonicalization)\n`);
