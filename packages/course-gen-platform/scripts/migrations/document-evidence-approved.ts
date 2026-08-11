/* eslint-disable max-lines --
 * The Q12 file-only migration credential contract and the same-transaction
 * guard publication must be co-located with this approved migration CLI: the
 * stream write zone is fixed to this file and the observability CLI, so the
 * shared credential/guard logic cannot be extracted into a new module. */
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, type ClientConfig } from 'pg';

// ---------------------------------------------------------------------------
// Q12 file-only migration credential contract (design section 8).
//
// In Q12 live mode the CLIs never accept an environment or argv URL. They read
// the database URI, CA, and run-bound database barrier capability only from
// owner-checked, non-symlink regular files, build a field-by-field pg
// ClientConfig with the pinned CA and a fixed read-write startup opt-out, and
// bind the barrier capability with `set_config(..., false)` on the same client
// before any migration statement. Secrets stay in process memory: they never
// reach argv, environment, errors, telemetry, logs, or artifacts.
// ---------------------------------------------------------------------------

export const Q12_MIGRATION_ENDPOINT = {
  protocol: 'postgresql:',
  user: 'postgres.diqooqbuchsliypgwksu',
  host: 'aws-1-us-east-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
} as const;

export const Q12_MIGRATION_CA_SHA256 =
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';

export const Q12_MIGRATION_STARTUP_OPTIONS = '-c default_transaction_read_only=off';

export const Q12_MIGRATION_SET_CAPABILITY_SQL =
  "SELECT set_config('megacampus.q12_capability', $1, false)";

export interface Q12MigrationCredentialPaths {
  dbUrlFile: string;
  caFile: string;
  capabilityFile: string;
}

export interface Q12MigrationCredentials {
  clientConfig: ClientConfig;
  capability: string;
}

// Test-only affordances. Production CLI callers never pass these: the trust
// boundary defaults to the filesystem root and the CA hash to the pinned
// production anchor. Tests set a private 0700 boundary so files created under a
// world-writable temp ancestor are still validatable, and pin a synthetic CA.
export interface Q12MigrationCredentialTestOverrides {
  trustBoundary?: string;
  expectedCaSha256?: string;
  afterOpen?: (label: string) => void | Promise<void>;
}

// node-postgres silently falls back to these libpq environment variables for any
// ClientConfig field left unset (and PGSERVICE/PGSERVICEFILE/PGOPTIONS can inject
// host, TLS, or startup options). Q12 mode fails closed on their mere presence
// rather than relying on explicit-field precedence.
export const Q12_REJECTED_LIBPQ_ENV_VARS = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGPASSFILE',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGOPTIONS',
  'PGSERVICE',
  'PGSERVICEFILE',
] as const;

export function assertNoQ12UrlEnvironmentOrArgument(
  env: NodeJS.ProcessEnv,
  args: readonly string[]
): void {
  if (env.SUPABASE_DB_URL !== undefined && env.SUPABASE_DB_URL !== '') {
    throw new Error('Q12 live migration mode rejects the SUPABASE_DB_URL environment variable');
  }
  for (const variable of Q12_REJECTED_LIBPQ_ENV_VARS) {
    if (env[variable] !== undefined && env[variable] !== '') {
      throw new Error(`Q12 live migration mode rejects the ${variable} environment variable`);
    }
  }
  const urlFlags = new Set(['--db-url', '--url', '--database-url', '--connection-string']);
  for (const arg of args) {
    if (arg.includes('://') || urlFlags.has(arg)) {
      throw new Error('Q12 live migration mode rejects any database URI argument');
    }
  }
}

type FileIdentity = string;

function identityOf(stats: {
  dev: number;
  ino: number;
  uid: number;
  gid: number;
  mode: number;
  size: number;
}): FileIdentity {
  return [stats.dev, stats.ino, stats.uid, stats.gid, stats.mode & 0o777, stats.size].join(':');
}

function assertAbsoluteControlFree(label: string, path: string): void {
  if (!path.startsWith('/') || path.includes('\n') || path.includes('\r')) {
    throw new Error(`${label} must be an absolute control-free path`);
  }
}

async function assertSafeParentChain(label: string, path: string, boundary: string): Promise<void> {
  let current = dirname(path);
  for (;;) {
    let stats;
    let canonical;
    try {
      stats = await lstat(current);
      canonical = await realpath(current);
    } catch {
      throw new Error(`${label} parent chain must contain only canonical non-symlink directories`);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || canonical !== current) {
      throw new Error(`${label} parent chain must contain only canonical non-symlink directories`);
    }
    if (stats.uid !== 0 && stats.uid !== process.getuid?.()) {
      throw new Error(`${label} parent has an unexpected owner`);
    }
    if ((stats.mode & 0o022) !== 0) {
      throw new Error(`${label} parent must not be group/world writable`);
    }
    if (current === boundary) return;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`${label} is outside the trusted boundary`);
    }
    current = parent;
  }
}

async function readOwnerCheckedFile(
  label: string,
  path: string,
  allowedModes: readonly number[],
  boundary: string,
  afterOpen?: (label: string) => void | Promise<void>
): Promise<Buffer> {
  assertAbsoluteControlFree(label, path);
  await assertSafeParentChain(label, path, boundary);
  let before;
  let canonical;
  try {
    before = await lstat(path);
    canonical = await realpath(path);
  } catch {
    throw new Error(`${label} must be a canonical non-symlink regular file`);
  }
  if (before.isSymbolicLink() || !before.isFile() || canonical !== path) {
    throw new Error(`${label} must be a canonical non-symlink regular file`);
  }
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    throw new Error(`${label} must be a canonical non-symlink regular file`);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || identityOf(opened) !== identityOf(before)) {
      throw new Error(`${label} identity changed while opening`);
    }
    if (opened.uid !== process.getuid?.() || opened.gid !== process.getgid?.()) {
      throw new Error(`${label} must be owned by the current UID:GID`);
    }
    if (!allowedModes.includes(opened.mode & 0o777)) {
      throw new Error(`${label} has an unsafe mode`);
    }
    const content = await handle.readFile();
    if (afterOpen) await afterOpen(label);
    let after;
    try {
      after = await lstat(path);
    } catch {
      throw new Error(`${label} identity changed after open`);
    }
    if (after.isSymbolicLink() || identityOf(after) !== identityOf(opened)) {
      throw new Error(`${label} identity changed after open`);
    }
    return content;
  } finally {
    await handle.close();
  }
}

function requireSingleLineValue(label: string, content: Buffer): string {
  const raw = content.toString('utf8');
  const value = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  if (value.length === 0) {
    throw new Error(`${label} must contain exactly one nonempty value`);
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} must contain exactly one single-line value`);
  }
  return value;
}

function parseQ12MigrationUri(uri: string): {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
} {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('Q12 migration database URI is malformed');
  }
  if (url.protocol !== Q12_MIGRATION_ENDPOINT.protocol) {
    throw new Error('Q12 migration database URI protocol is not accepted');
  }
  if (url.hostname !== Q12_MIGRATION_ENDPOINT.host) {
    throw new Error('Q12 migration database URI host is not accepted');
  }
  if (url.port !== String(Q12_MIGRATION_ENDPOINT.port)) {
    throw new Error('Q12 migration database URI port is not accepted');
  }
  if (url.pathname !== `/${Q12_MIGRATION_ENDPOINT.database}`) {
    throw new Error('Q12 migration database URI database is not accepted');
  }
  if (decodeURIComponent(url.username) !== Q12_MIGRATION_ENDPOINT.user) {
    throw new Error('Q12 migration database URI user is not accepted');
  }
  if (url.search !== '' || url.searchParams.size !== 0) {
    throw new Error('Q12 migration database URI must have zero query parameters');
  }
  if (url.hash !== '') {
    throw new Error('Q12 migration database URI must have no fragment');
  }
  const password = decodeURIComponent(url.password);
  if (password.length === 0) {
    throw new Error('Q12 migration database URI password is required');
  }
  return {
    user: Q12_MIGRATION_ENDPOINT.user,
    password,
    host: Q12_MIGRATION_ENDPOINT.host,
    port: Q12_MIGRATION_ENDPOINT.port,
    database: Q12_MIGRATION_ENDPOINT.database,
  };
}

export async function loadQ12MigrationCredentials(
  paths: Q12MigrationCredentialPaths,
  overrides: Q12MigrationCredentialTestOverrides = {}
): Promise<Q12MigrationCredentials> {
  const boundary = overrides.trustBoundary ?? '/';
  const expectedCaSha256 = overrides.expectedCaSha256 ?? Q12_MIGRATION_CA_SHA256;
  const urlContent = await readOwnerCheckedFile(
    'database URL file',
    paths.dbUrlFile,
    [0o400, 0o600],
    boundary,
    overrides.afterOpen
  );
  const caContent = await readOwnerCheckedFile(
    'CA file',
    paths.caFile,
    [0o644],
    boundary,
    overrides.afterOpen
  );
  const capabilityContent = await readOwnerCheckedFile(
    'database capability file',
    paths.capabilityFile,
    [0o400],
    boundary,
    overrides.afterOpen
  );

  const fields = parseQ12MigrationUri(requireSingleLineValue('database URL file', urlContent));
  if (createHash('sha256').update(caContent).digest('hex') !== expectedCaSha256) {
    throw new Error('Q12 migration CA SHA-256 does not match the pinned trust anchor');
  }
  const capability = requireSingleLineValue('database capability file', capabilityContent);

  const clientConfig: ClientConfig = {
    host: fields.host,
    port: fields.port,
    database: fields.database,
    user: fields.user,
    password: fields.password,
    ssl: {
      ca: caContent,
      rejectUnauthorized: true,
      servername: fields.host,
    },
    options: Q12_MIGRATION_STARTUP_OPTIONS,
  };
  return { clientConfig, capability };
}

export async function bindQ12MigrationSession(client: Client, capability: string): Promise<void> {
  const proof = await client.query<{
    session_user: string;
    current_database: string;
    server_major: number;
    transaction_read_only: string;
  }>(
    `SELECT session_user AS session_user,
            current_database() AS current_database,
            (current_setting('server_version_num')::int / 10000) AS server_major,
            current_setting('transaction_read_only') AS transaction_read_only`
  );
  const row = proof.rows[0];
  if (!row || row.session_user !== 'postgres') {
    throw new Error('Q12 migration session must authenticate directly as postgres');
  }
  if (row.current_database !== 'postgres') {
    throw new Error('Q12 migration session must target the postgres database');
  }
  if (Number(row.server_major) !== 17) {
    throw new Error('Q12 migration session server identity is not accepted');
  }
  if (row.transaction_read_only !== 'off') {
    throw new Error('Q12 migration session must start read-write');
  }
  await client.query(Q12_MIGRATION_SET_CAPABILITY_SQL, [capability]);
}

type Direction = 'apply' | 'rollback';
type RemoteGate = { allowRemote?: boolean; confirmation?: string };
type MigrationResult = 'applied' | 'rolled_back' | 'reused' | 'recovered';
type SourceSpec = { url: URL; sha256: string };
type LoadedSource = SourceSpec & { statements: string[] };
type LoadedMigration = {
  version: string;
  name: string;
  apply: LoadedSource;
  rollback: LoadedSource;
};
type RepositoryMigration = { version: string; name: string; filename: string };
type HistoryRow = { version: string; name: string | null; statements: string[] | null };
type CatalogRow = Record<string, unknown>;

const DOCUMENT_EVIDENCE_TABLES = [
  'document_evidence_batch_checkpoints',
  'document_evidence_conflict_checkpoints',
  'document_evidence_conflicts',
  'document_evidence_decisions',
  'document_evidence_items',
  'document_evidence_retry_applications',
  'document_evidence_runs',
] as const;

const DOCUMENT_EVIDENCE_FUNCTIONS = [
  'append_document_evidence_decision',
  'answer_document_evidence_question_atomic',
  'answer_document_evidence_questions_atomic',
  'auto_answer_questions_atomic',
  'checkpoint_document_evidence_run_metrics',
  'commit_document_evidence_batch',
  'commit_document_evidence_conflict_batch',
  'consume_document_evidence_retry_directives',
  'create_or_reuse_document_evidence_run',
  'document_evidence_conflict_side_handle',
  'document_evidence_retry_attempt',
  'document_evidence_sha256',
  'document_evidence_subject_key',
  'enforce_document_evidence_run_source_manifest',
  'ensure_document_evidence_question_atomic',
  'finalize_document_evidence_run',
  'get_document_evidence_retry_directives',
  'get_document_evidence_retry_state',
  'guard_document_evidence_course_transition',
  'materialize_document_evidence_decision_gate_atomic',
  'normalize_document_evidence_source_manifest',
  'persist_document_evidence_items',
  'prevent_document_evidence_terminal_item_mutation',
  'prevent_document_evidence_terminal_run_mutation',
  'record_document_evidence_automatic_retry',
  'refresh_document_evidence_decision_snapshot',
  'reject_document_evidence_conflict_checkpoint_mutation',
  'reject_document_evidence_mutation',
  'resolve_document_evidence_question_atomic',
  'set_document_evidence_updated_at',
  'upsert_document_evidence_conflict',
  'validate_document_evidence_batch_checkpoint_scope',
  'validate_document_evidence_conflict_allowlist',
  'validate_document_evidence_conflict_checkpoint_scope',
  'validate_document_evidence_conflict_scope',
  'validate_document_evidence_conflict_side_identity',
  'validate_document_evidence_decision_chain',
  'validate_document_evidence_item_scope',
  'validate_document_evidence_run_tenant',
  'verify_document_evidence_terminal_coverage',
] as const;

const DOCUMENT_EVIDENCE_DOWNSTREAM_RELATIONS = [
  'document_evidence_observability_totals',
  'idx_clarifying_pending_critical_evidence_created_at',
] as const;

const DOCUMENT_EVIDENCE_DOWNSTREAM_FUNCTIONS = [
  'get_document_evidence_observability_totals',
  'increment_document_evidence_checkpoint_totals',
  'increment_document_evidence_conflict_totals',
  'increment_document_evidence_observability_totals',
  'increment_document_evidence_terminal_totals',
] as const;

const DOCUMENT_EVIDENCE_DOWNSTREAM_TRIGGERS = [
  'increment_document_evidence_checkpoint_totals',
  'increment_document_evidence_conflict_totals',
  'increment_document_evidence_observability_totals',
  'increment_document_evidence_terminal_insert_totals',
  'increment_document_evidence_terminal_totals',
] as const;

export const DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION = {
  apply: 'APPLY REMOTE DOCUMENT EVIDENCE BASE 20260711120000 20260711130000 20260711140000',
  rollback: 'ROLL BACK REMOTE DOCUMENT EVIDENCE BASE 20260711140000 20260711130000 20260711120000',
} as const;

export const DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS = [
  {
    version: '20260711120000',
    name: 'document_evidence',
    apply: {
      url: new URL(
        '../../supabase/migrations/20260711120000_document_evidence.sql',
        import.meta.url
      ),
      sha256: 'cc540ffefb430be39338c259c22502a3e3be0a49e64dbe33d86be371b5f9b521',
    },
    rollback: {
      url: new URL(
        '../../supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql',
        import.meta.url
      ),
      sha256: 'ba9d59e4eb150aa53cace3c239863d78ef26fd4f409eae25ad29103407b55ee4',
    },
  },
  {
    version: '20260711130000',
    name: 'document_conflict_auto_answers',
    apply: {
      url: new URL(
        '../../supabase/migrations/20260711130000_document_conflict_auto_answers.sql',
        import.meta.url
      ),
      sha256: '3e2c5520a0971877074a21aa701194e0c0a3f152ac5ed95d3b8a3555bf5ffb0c',
    },
    rollback: {
      url: new URL(
        '../../supabase/migrations/rollback/20260711130000_document_conflict_auto_answers_rollback.sql',
        import.meta.url
      ),
      sha256: '91036c5bff892817ec702719acd7e9d58f0aa0bda7d2b795201b80b70361d1cc',
    },
  },
  {
    version: '20260711140000',
    name: 'document_conflict_side_identity',
    apply: {
      url: new URL(
        '../../supabase/migrations/20260711140000_document_conflict_side_identity.sql',
        import.meta.url
      ),
      sha256: 'cd30f33a8c94c9aabb3e1cbc3303fedfddb370f915fb2519368793bd562c1373',
    },
    rollback: {
      url: new URL(
        '../../supabase/migrations/rollback/20260711140000_document_conflict_side_identity_rollback.sql',
        import.meta.url
      ),
      sha256: '86999bffd423b72e629665d84299be33d228b9979e6baedf90bb1df5895b220a',
    },
  },
] as const satisfies ReadonlyArray<{
  version: string;
  name: string;
  apply: SourceSpec;
  rollback: SourceSpec;
}>;

const DOCUMENT_EVIDENCE_DOWNSTREAM_MIGRATIONS = [
  {
    version: '20260711150000',
    name: 'document_evidence_observability_index',
    apply: {
      url: new URL(
        '../../supabase/migrations/20260711150000_document_evidence_observability_index.sql',
        import.meta.url
      ),
      sha256: 'a7f6d6958b158d10f53f3fb0103047f0ea1ade8a020d78176e365237e4eccfe8',
    },
  },
  {
    version: '20260711151000',
    name: 'document_evidence_observability_totals',
    apply: {
      url: new URL(
        '../../supabase/migrations/20260711151000_document_evidence_observability_totals.sql',
        import.meta.url
      ),
      sha256: '5f675b1a8a933128520b2fb9d42632a9cbefff2e57ec72f06cd42cd6e0a090e3',
    },
  },
] as const satisfies ReadonlyArray<{ version: string; name: string; apply: SourceSpec }>;

// Re-pinned 2026-08-11 after adding
// 20260811120000_career_playbook_quality_v2_routing.sql (Career Playbook quality
// v2: spec output budget 16000, phase timeouts 120000). The digest covers the
// sorted migration filename list, so any added, renamed, or removed migration
// must be re-pinned deliberately — that is the point of the guard.
const REPOSITORY_MIGRATION_MANIFEST_SHA256 =
  '2848165a01cfe2790cf798a339b5ac2a52647d38a57a49a1e5e6ff728b9db317';

// The reviewed migration frontier: the maximum Supabase history version that may exist
// BEFORE this project's approved chain applies. In this codebase production migrations are
// applied via the Supabase MCP, which stamps history rows with its OWN apply-time version
// timestamps that have no same-named repository file — so the earlier premise "every
// history version is a repository filename" is false and can never pass against the real
// database. This pinned frontier gives the equivalent anti-drift protection (no unknown
// history NEWER than the reviewed anchor can precede the chain) without cross-referencing
// history rows against repo filenames the CLI cannot know.
const APPROVED_HISTORY_FRONTIER = '20260704150249';

// PG17 digests (PostgreSQL 17.6, pinned Supabase image
// public.ecr.aws/supabase/postgres@sha256:d00c45c73f9c3d130ea4f379d8ae77
// 48b0711d628eea690d27d03198ed609f2f) were computed on the isolated
// restore of generation-20260716T105950Z during the .13.7 drill:
// dcc90cc2 pre-120000, 4df2b22b after-120000, f7100de0 after-130000,
// e148e241 after-140000 (the 150000 index is outside the manifest scope),
// 2597a553 after-151000.
const DOCUMENT_EVIDENCE_SECURITY_MANIFEST_SHA256 = {
  '20260711120000': [
    '72988256cbd42ae01d6dc0beb32029f7cfa54df514ed6ab5d26f796e33eab982',
    'fa5793107ef4c8bc206583d4987cf9a942cc74f5fcafce28d2478ae6d2d95f87',
    '938b24f560cb198abd0568c0bd52e99899b84cde0d2d0a22a154da6dd5c2e7ed',
    '20e5ad26b97501a70d41d098fe1f3377b5e82fe47d4d98346c2e6e6905f9aeca',
    'b5271e29b09e9793cfe6ba87cf2a953111b62c5e5005d4e87ea99a3bf83ba8fb',
    '4df2b22b01d491881817d12a4fad97e4d18dd1cf583b7bfc463947d0397281b4',
    'f7100de0c9b9a6169877412c049d56812b2adb63f21b1b4a23caaafaa9169d90',
    'e148e24167425cc429095ef32612883b194cea0b50ba920316f93386c410e5c7',
    '2597a5537c13983961cf0a827f4f9923ac7a890307ea77bcf3b1b7d3e61031c3',
  ],
  '20260711130000': [
    'fa5793107ef4c8bc206583d4987cf9a942cc74f5fcafce28d2478ae6d2d95f87',
    '938b24f560cb198abd0568c0bd52e99899b84cde0d2d0a22a154da6dd5c2e7ed',
    '20e5ad26b97501a70d41d098fe1f3377b5e82fe47d4d98346c2e6e6905f9aeca',
    'f7100de0c9b9a6169877412c049d56812b2adb63f21b1b4a23caaafaa9169d90',
    'e148e24167425cc429095ef32612883b194cea0b50ba920316f93386c410e5c7',
    '2597a5537c13983961cf0a827f4f9923ac7a890307ea77bcf3b1b7d3e61031c3',
  ],
  '20260711140000': [
    '938b24f560cb198abd0568c0bd52e99899b84cde0d2d0a22a154da6dd5c2e7ed',
    'e148e24167425cc429095ef32612883b194cea0b50ba920316f93386c410e5c7',
    '2597a5537c13983961cf0a827f4f9923ac7a890307ea77bcf3b1b7d3e61031c3',
  ],
} as const;

const DOCUMENT_EVIDENCE_ABSENT_SECURITY_MANIFEST_SHA256 = {
  '20260711120000': [
    '77ab45ff3adb8c5f0b935f7c2b2a169ced88a11bc4773b99ae2f1256a9b70766',
    '9e6d9be5a369b1b4677437d2031288d88057938640348c53ae7626dc66b6e39e',
    'dcc90cc2d4d3caaba0f6087314ef2a57ff5faaa3157b571509b410f583b500e0',
  ],
  '20260711130000': [
    '77ab45ff3adb8c5f0b935f7c2b2a169ced88a11bc4773b99ae2f1256a9b70766',
    '9e6d9be5a369b1b4677437d2031288d88057938640348c53ae7626dc66b6e39e',
    '72988256cbd42ae01d6dc0beb32029f7cfa54df514ed6ab5d26f796e33eab982',
    'b5271e29b09e9793cfe6ba87cf2a953111b62c5e5005d4e87ea99a3bf83ba8fb',
    'dcc90cc2d4d3caaba0f6087314ef2a57ff5faaa3157b571509b410f583b500e0',
    '4df2b22b01d491881817d12a4fad97e4d18dd1cf583b7bfc463947d0397281b4',
  ],
  '20260711140000': [
    '77ab45ff3adb8c5f0b935f7c2b2a169ced88a11bc4773b99ae2f1256a9b70766',
    '9e6d9be5a369b1b4677437d2031288d88057938640348c53ae7626dc66b6e39e',
    '72988256cbd42ae01d6dc0beb32029f7cfa54df514ed6ab5d26f796e33eab982',
    'b5271e29b09e9793cfe6ba87cf2a953111b62c5e5005d4e87ea99a3bf83ba8fb',
    'fa5793107ef4c8bc206583d4987cf9a942cc74f5fcafce28d2478ae6d2d95f87',
    '20e5ad26b97501a70d41d098fe1f3377b5e82fe47d4d98346c2e6e6905f9aeca',
    'dcc90cc2d4d3caaba0f6087314ef2a57ff5faaa3157b571509b410f583b500e0',
    '4df2b22b01d491881817d12a4fad97e4d18dd1cf583b7bfc463947d0397281b4',
    'f7100de0c9b9a6169877412c049d56812b2adb63f21b1b4a23caaafaa9169d90',
  ],
} as const;

// A Q12 run supplies an already-validated field-by-field ClientConfig plus the
// run-bound database barrier capability. It is mutually exclusive with the
// ordinary in-memory `databaseUrl`: Q12 mutation never routes through the
// legacy `connectionString` connection.
export interface Q12MigrationRunContext {
  clientConfig: ClientConfig;
  capability: string;
}

export interface DocumentEvidenceApprovedMigrationOptions extends RemoteGate {
  databaseUrl?: string;
  direction: Direction;
  q12?: Q12MigrationRunContext;
}

export type MigrationConnectionSource =
  | { kind: 'url'; connectionString: string }
  | { kind: 'q12'; context: Q12MigrationRunContext };

// Fail closed unless exactly one connection source is present. This is the
// single choke point that guarantees Q12 file-only mutation and an ordinary
// programmatic URL can never be combined, and that Q12 never yields a
// `connectionString`.
export function resolveMigrationConnectionSource(options: {
  databaseUrl?: string;
  q12?: Q12MigrationRunContext;
}): MigrationConnectionSource {
  const hasUrl = typeof options.databaseUrl === 'string' && options.databaseUrl.length > 0;
  const hasQ12 = options.q12 != null;
  if (hasUrl && hasQ12) {
    throw new Error(
      'Document evidence migration rejects a combined Q12 file-only context and databaseUrl'
    );
  }
  if (!hasUrl && !hasQ12) {
    throw new Error(
      'Document evidence migration requires exactly one of a Q12 file-only context or databaseUrl'
    );
  }
  return hasQ12
    ? { kind: 'q12', context: options.q12! }
    : { kind: 'url', connectionString: options.databaseUrl! };
}

function isLoopback(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
}

export function validateDocumentEvidenceApprovedMigrationTarget(
  databaseUrl: string,
  direction: Direction,
  gate: RemoteGate
): URL {
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error('Approved document evidence migration database URL is invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('Approved document evidence migration requires a PostgreSQL URL');
  }
  if (isLoopback(target.hostname)) return target;
  if (!gate.allowRemote) {
    throw new Error('Approved document evidence migration remote targets are disabled by default');
  }
  if (gate.confirmation !== DOCUMENT_EVIDENCE_APPROVED_REMOTE_CONFIRMATION[direction]) {
    throw new Error('Approved document evidence migration remote confirmation does not match');
  }
  if (target.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error(
      'Approved document evidence migration remote targets require sslmode=verify-full'
    );
  }
  return target;
}

// Compatible with Supabase CLI v2.106.0 parser.SplitAndTrim for these fixed files.
function splitSupabaseStatements(source: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  let state: 'ready' | 'single' | 'double' | 'line' | 'block' | 'dollar' = 'ready';
  let blockDepth = 0;
  let dollarDelimiter = '';
  const emit = (end: number): void => {
    const statement = source.slice(start, end).replace(/;+$/u, '').trim();
    if (statement) statements.push(statement);
    start = end;
  };
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (state === 'ready') {
      if (current === '-' && next === '-') {
        state = 'line';
        index += 2;
        continue;
      }
      if (current === '/' && next === '*') {
        state = 'block';
        blockDepth = 1;
        index += 2;
        continue;
      }
      if (current === "'") state = 'single';
      else if (current === '"') state = 'double';
      else if (current === '$') {
        const tag = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/u)?.[0];
        if (tag) {
          dollarDelimiter = tag;
          state = 'dollar';
          index += tag.length;
          continue;
        }
      } else if (current === ';') emit(index + 1);
      else if (current === '\\') {
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (current === '\n') state = 'ready';
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (current === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
      } else if (current === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = 'ready';
      } else index += 1;
      continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(dollarDelimiter, index)) {
        index += dollarDelimiter.length;
        state = 'ready';
      } else index += 1;
      continue;
    }
    const delimiter = state === 'single' ? "'" : '"';
    if (current === delimiter && next === delimiter) index += 2;
    else if (current === delimiter) {
      state = 'ready';
      index += 1;
    } else index += 1;
  }
  emit(source.length);
  return statements;
}

async function loadSource(source: SourceSpec): Promise<LoadedSource> {
  const contents = await readFile(source.url, 'utf8');
  const digest = createHash('sha256').update(contents).digest('hex');
  if (digest !== source.sha256) {
    throw new Error('Approved document evidence migration source differs from the fixed allowlist');
  }
  return { ...source, statements: splitSupabaseStatements(contents) };
}

export async function loadDocumentEvidenceApprovedMigrations(): Promise<LoadedMigration[]> {
  return Promise.all(
    DOCUMENT_EVIDENCE_APPROVED_MIGRATIONS.map(async migration => ({
      version: migration.version,
      name: migration.name,
      apply: await loadSource(migration.apply),
      rollback: await loadSource(migration.rollback),
    }))
  );
}

async function loadRepositoryMigrations(): Promise<RepositoryMigration[]> {
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const filenames = (await readdir(directory))
    .filter(filename => /^\d{14}_.+\.sql$/u.test(filename))
    .sort();
  const digest = createHash('sha256')
    .update(`${filenames.join('\n')}\n`)
    .digest('hex');
  if (digest !== REPOSITORY_MIGRATION_MANIFEST_SHA256) {
    throw new Error('Repository migration manifest differs from the fixed frontier');
  }
  return filenames.map(filename => {
    const match = filename.match(/^(\d{14})_(.+)\.sql$/u);
    if (!match) throw new Error('Repository migration filename is unsupported');
    return { version: match[1], name: match[2], filename };
  });
}

async function loadDownstreamMigrations(): Promise<LoadedMigration[]> {
  return Promise.all(
    DOCUMENT_EVIDENCE_DOWNSTREAM_MIGRATIONS.map(async migration => ({
      version: migration.version,
      name: migration.name,
      apply: await loadSource(migration.apply),
      rollback: await loadSource(migration.apply),
    }))
  );
}

async function requireSupabaseHistory(client: Client): Promise<void> {
  // Existence by resolution (IS NOT NULL) is search_path-independent; the earlier
  // to_regclass(...)::text = 'supabase_migrations.schema_migrations' compared a rendered name
  // against a qualified literal (safe only while supabase_migrations is absent from the
  // session search_path — it is, for the postgres role — but a latent search_path trap).
  const relation = await client.query<{ present: boolean }>(
    `SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS present`
  );
  if (relation.rows[0]?.present !== true) {
    throw new Error('Existing Supabase migration history is required');
  }
  const columns = await client.query<{ column_name: string; data_type: string }>(`
    SELECT column_name,data_type FROM information_schema.columns
    WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
      AND column_name IN ('version','name','statements')
  `);
  const shape = new Map(columns.rows.map(row => [row.column_name, row.data_type]));
  if (
    shape.get('version') !== 'text' ||
    shape.get('name') !== 'text' ||
    shape.get('statements') !== 'ARRAY'
  ) {
    throw new Error('Supabase migration history has an unsupported shape');
  }
}

async function readHistory(client: Client, version: string): Promise<HistoryRow | undefined> {
  return (
    await client.query<HistoryRow>(
      `SELECT version,name,statements FROM supabase_migrations.schema_migrations WHERE version=$1`,
      [version]
    )
  ).rows[0];
}

export async function assertRepositoryMigrationFrontier(
  client: Client,
  approved: LoadedMigration[]
): Promise<number> {
  // Keep the repository-tree pin EXACTLY (loadRepositoryMigrations validates the on-disk
  // migration set against REPOSITORY_MIGRATION_MANIFEST_SHA256). It just no longer
  // cross-references DB history rows, which in this project are MCP apply-time versions
  // with no same-named repo file.
  await loadRepositoryMigrations();
  const downstream = await loadDownstreamMigrations();
  const chain = [...approved, ...downstream];
  const chainVersions = new Set(chain.map(migration => migration.version));
  const history = (
    await client.query<HistoryRow>(
      `SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version`
    )
  ).rows;
  const historyByVersion = new Map<string, HistoryRow>();
  for (const row of history) {
    if (historyByVersion.has(row.version)) {
      throw new Error('Supabase migration history contains a duplicate version');
    }
    historyByVersion.set(row.version, row);
    // Anti-drift anchor: no unknown history strictly NEWER than the reviewed frontier may
    // precede our chain. Every non-chain history version must be at or before the frontier;
    // this also forbids any version strictly between the frontier and the first chain
    // version (those are non-chain and above the frontier).
    if (!chainVersions.has(row.version) && row.version > APPROVED_HISTORY_FRONTIER) {
      throw new Error('Supabase repository migration frontier contains unknown history');
    }
  }
  // Our chain must form a supported PREFIX of history (unchanged): none applied -> apply
  // all; a partial prefix -> continue; a gap after an applied version -> fail.
  let prefixLength = 0;
  let missing = false;
  for (const migration of chain) {
    const row = historyByVersion.get(migration.version);
    if (!row) {
      missing = true;
      continue;
    }
    if (missing) {
      throw new Error('Approved document evidence migration history is not a supported prefix');
    }
    assertExactHistory(row, migration);
    prefixLength += 1;
  }
  return prefixLength;
}

function assertExactHistory(row: HistoryRow, migration: LoadedMigration): void {
  if (
    row.name !== migration.name ||
    JSON.stringify(row.statements) !== JSON.stringify(migration.apply.statements)
  ) {
    throw new Error(
      `Supabase migration history ${migration.version} does not match the fixed migration`
    );
  }
}

async function relationExists(client: Client, relation: string): Promise<boolean> {
  // Existence by resolution (IS NOT NULL) is search_path-independent; the earlier
  // to_regclass($1)::text = <name stripped of public.> relied on `public` being on the
  // session search_path to render unqualified — true today, but a latent search_path trap.
  const result = await client.query<{ present: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [relation]
  );
  return result.rows[0]?.present === true;
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     ) AS present`,
    [table, column]
  );
  return result.rows[0]?.present === true;
}

async function assertRelations(client: Client, names: string[], version: string): Promise<void> {
  const result = await client.query<{ name: string; rls: boolean }>(
    `SELECT relname AS name, relrowsecurity AS rls
     FROM pg_class JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
     WHERE pg_namespace.nspname='public' AND relname=ANY($1::text[])`,
    [names]
  );
  const found = new Map(result.rows.map(row => [row.name, row.rls]));
  if (names.some(name => found.get(name) !== true)) {
    throw new Error(`Live document evidence objects do not match migration ${version}`);
  }
}

async function assertProcedures(
  client: Client,
  signatures: string[],
  version: string
): Promise<void> {
  const result = await client.query<{ signature: string; procedure: string | null }>(
    `SELECT signature, to_regprocedure('public.' || signature)::text AS procedure
     FROM unnest($1::text[]) signature`,
    [signatures]
  );
  if (result.rows.some(row => row.procedure === null)) {
    throw new Error(`Live document evidence functions do not match migration ${version}`);
  }
}

async function assertIndexes(client: Client, names: string[], version: string): Promise<void> {
  const result = await client.query<{ name: string }>(
    `SELECT indexname AS name FROM pg_indexes
     WHERE schemaname='public' AND indexname=ANY($1::text[])`,
    [names]
  );
  const found = new Set(result.rows.map(row => row.name));
  if (names.some(name => !found.has(name))) {
    throw new Error(`Live document evidence indexes do not match migration ${version}`);
  }
}

async function assertClarifyingSubjectIndex(client: Client): Promise<void> {
  const result = await client.query<{
    definition: string;
    predicate: string;
    indisunique: boolean;
    indisvalid: boolean;
    indisready: boolean;
    indislive: boolean;
    indnkeyatts: number;
    indnatts: number;
    expressions: string[];
  }>(`
    SELECT pg_get_indexdef(indexes.indexrelid) AS definition,
      pg_get_expr(indexes.indpred,indexes.indrelid) AS predicate,
      indexes.indisunique,indexes.indisvalid,indexes.indisready,indexes.indislive,
      indexes.indnkeyatts,indexes.indnatts,
      to_json(ARRAY(
        SELECT pg_get_indexdef(indexes.indexrelid,position,true)
        FROM generate_series(1,indexes.indnkeyatts) position ORDER BY position
      )) AS expressions
    FROM pg_index indexes
    JOIN pg_class index_rel ON index_rel.oid=indexes.indexrelid
    JOIN pg_class table_rel ON table_rel.oid=indexes.indrelid
    JOIN pg_namespace namespaces ON namespaces.oid=table_rel.relnamespace
    WHERE namespaces.nspname='public' AND table_rel.relname='clarifying_questions'
      AND index_rel.relname='clarifying_questions_document_evidence_subject_unique'
  `);
  const index = result.rows[0];
  if (
    !index ||
    index.definition !==
      "CREATE UNIQUE INDEX clarifying_questions_document_evidence_subject_unique ON public.clarifying_questions USING btree (course_id, ((metadata ->> 'run_id'::text)), ((metadata ->> 'subject_key'::text))) WHERE (question_category = 'document_conflicts'::text)" ||
    index.predicate !== "(question_category = 'document_conflicts'::text)" ||
    !index.indisunique ||
    !index.indisvalid ||
    !index.indisready ||
    !index.indislive ||
    index.indnkeyatts !== 3 ||
    index.indnatts !== 3 ||
    JSON.stringify(index.expressions) !==
      JSON.stringify([
        'course_id',
        "(metadata ->> 'run_id'::text)",
        "(metadata ->> 'subject_key'::text)",
      ])
  ) {
    throw new Error('Live clarifying document evidence subject index does not match');
  }
}

export async function assertPgcryptoDigestDependency(client: Client): Promise<void> {
  // Resolve extensions.digest(bytea,text) by its QUALIFIED name (to_regprocedure is
  // search_path-independent for resolution) and assert explicit CATALOG facts. The earlier
  // `to_regprocedure(...)::text = 'extensions.digest(bytea,text)'` clause was
  // search_path-SENSITIVE: to_regprocedure(...)::text drops the schema when `extensions` is
  // on the session search_path, and the §3-allowlisted postgres role carries
  // search_path="$user", public, extensions in both cloud and the drill-replayed isolate,
  // so the rendered value was `digest(bytea,text)` and the check failed against every real
  // environment. Argument/return types render as pg_catalog types (bytea, text), which are
  // always unqualified, so those comparisons stay search_path-safe.
  const result = await client.query<{
    extname: string;
    extversion: string;
    extension_schema: string;
    digest_present: boolean;
    digest_schema: string | null;
    digest_name: string | null;
    digest_arguments: string | null;
    result_type: string | null;
    language: string | null;
    security_definer: boolean | null;
    configuration: string[];
  }>(`
    SELECT extensions.extname,extensions.extversion,extension_namespace.nspname AS extension_schema,
      procedures.oid IS NOT NULL AS digest_present,
      procedure_namespace.nspname AS digest_schema,
      procedures.proname AS digest_name,
      pg_get_function_identity_arguments(procedures.oid) AS digest_arguments,
      procedures.prorettype::regtype::text AS result_type,languages.lanname AS language,
      procedures.prosecdef AS security_definer,
      COALESCE(to_json(procedures.proconfig),'[]'::json) AS configuration
    FROM pg_extension extensions
    JOIN pg_namespace extension_namespace ON extension_namespace.oid=extensions.extnamespace
    LEFT JOIN pg_proc procedures
      ON procedures.oid=to_regprocedure('extensions.digest(bytea,text)')
    LEFT JOIN pg_namespace procedure_namespace ON procedure_namespace.oid=procedures.pronamespace
    LEFT JOIN pg_language languages ON languages.oid=procedures.prolang
    WHERE extensions.extname='pgcrypto'
  `);
  const dependency = result.rows[0];
  if (
    !dependency ||
    dependency.extname !== 'pgcrypto' ||
    dependency.extversion !== '1.3' ||
    dependency.extension_schema !== 'extensions' ||
    dependency.digest_present !== true ||
    dependency.digest_schema !== 'extensions' ||
    dependency.digest_name !== 'digest' ||
    dependency.digest_arguments !== 'bytea, text' ||
    dependency.result_type !== 'bytea' ||
    dependency.language !== 'c' ||
    dependency.security_definer !== false ||
    JSON.stringify(dependency.configuration) !== '[]'
  ) {
    throw new Error('Required extensions.pgcrypto digest dependency does not match');
  }
}

function normalizeCatalogText(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : value;
}

function normalizeCatalogRows(rows: CatalogRow[], definitionKeys: string[] = []): CatalogRow[] {
  return rows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        definitionKeys.includes(key) ? normalizeCatalogText(value) : value,
      ])
    )
  );
}

export async function readDocumentEvidenceSecurityManifest(client: Client): Promise<{
  tables: CatalogRow[];
  columns: CatalogRow[];
  constraints: CatalogRow[];
  indexes: CatalogRow[];
  triggers: CatalogRow[];
  policies: CatalogRow[];
  tablePrivileges: CatalogRow[];
  functions: CatalogRow[];
  functionPrivileges: CatalogRow[];
}> {
  const tables = (
    await client.query<CatalogRow>(
      `SELECT relname AS table_name,relrowsecurity AS rls_enabled,
              relforcerowsecurity AS rls_forced
       FROM pg_class
       JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
       WHERE pg_namespace.nspname='public' AND relkind='r'
         AND relname=ANY($1::text[])
       ORDER BY relname`,
      [DOCUMENT_EVIDENCE_TABLES]
    )
  ).rows;
  const columns = normalizeCatalogRows(
    (
      await client.query<CatalogRow>(
        `SELECT tables.relname AS table_name,attributes.attnum AS ordinal,
                attributes.attname AS column_name,
                format_type(attributes.atttypid,attributes.atttypmod) AS data_type,
                attributes.attnotnull AS not_null,attributes.attidentity AS identity_kind,
                attributes.attgenerated AS generated_kind,
                pg_get_expr(defaults.adbin,defaults.adrelid) AS default_expression
         FROM pg_attribute attributes
         JOIN pg_class tables ON tables.oid=attributes.attrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         LEFT JOIN pg_attrdef defaults
           ON defaults.adrelid=attributes.attrelid AND defaults.adnum=attributes.attnum
         WHERE namespaces.nspname='public' AND tables.relname=ANY($1::text[])
           AND attributes.attnum > 0 AND NOT attributes.attisdropped
         ORDER BY tables.relname,attributes.attnum`,
        [DOCUMENT_EVIDENCE_TABLES]
      )
    ).rows,
    ['default_expression']
  );
  const constraints = normalizeCatalogRows(
    (
      await client.query<CatalogRow>(
        `SELECT tables.relname AS table_name,constraints.conname AS constraint_name,
                constraints.contype AS constraint_type,
                constraints.convalidated AS validated,
                constraints.condeferrable AS deferrable,
                constraints.condeferred AS initially_deferred,
                pg_get_constraintdef(constraints.oid,true) AS definition
         FROM pg_constraint constraints
         JOIN pg_class tables ON tables.oid=constraints.conrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         WHERE namespaces.nspname='public' AND tables.relname=ANY($1::text[])
         ORDER BY tables.relname,constraints.conname`,
        [DOCUMENT_EVIDENCE_TABLES]
      )
    ).rows,
    ['definition']
  );
  const indexes = normalizeCatalogRows(
    (
      await client.query<CatalogRow>(
        `SELECT tables.relname AS table_name,index_rel.relname AS index_name,
                indexes.indisunique AS is_unique,indexes.indisprimary AS is_primary,
                indexes.indisvalid AS is_valid,indexes.indisready AS is_ready,
                indexes.indislive AS is_live,pg_get_indexdef(indexes.indexrelid) AS definition
         FROM pg_index indexes
         JOIN pg_class tables ON tables.oid=indexes.indrelid
         JOIN pg_class index_rel ON index_rel.oid=indexes.indexrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         WHERE namespaces.nspname='public' AND tables.relname=ANY($1::text[])
         ORDER BY tables.relname,index_rel.relname`,
        [DOCUMENT_EVIDENCE_TABLES]
      )
    ).rows,
    ['definition']
  );
  const triggers = normalizeCatalogRows(
    (
      await client.query<CatalogRow>(
        `SELECT tables.relname AS table_name,triggers.tgname AS trigger_name,
                triggers.tgenabled AS enabled,triggers.tgdeferrable AS deferrable,
                triggers.tginitdeferred AS initially_deferred,
                pg_get_triggerdef(triggers.oid,true) AS definition,
                procedures.proname || '(' || pg_get_function_identity_arguments(procedures.oid) || ')'
                  AS function_signature
         FROM pg_trigger triggers
         JOIN pg_class tables ON tables.oid=triggers.tgrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         JOIN pg_proc procedures ON procedures.oid=triggers.tgfoid
         WHERE namespaces.nspname='public' AND NOT triggers.tgisinternal
           AND (tables.relname=ANY($1::text[]) OR tables.relname='courses')
           AND procedures.proname=ANY($2::text[])
         ORDER BY tables.relname,triggers.tgname`,
        [DOCUMENT_EVIDENCE_TABLES, DOCUMENT_EVIDENCE_FUNCTIONS]
      )
    ).rows,
    ['definition']
  );
  const policies = normalizeCatalogRows(
    (
      await client.query<CatalogRow>(
        `SELECT tables.relname AS table_name,policies.polname AS policy_name,
                policies.polpermissive AS permissive,policies.polcmd AS command,
                to_json(ARRAY(
                  SELECT CASE WHEN role_oid=0 THEN 'public' ELSE roles.rolname END
                  FROM unnest(policies.polroles) role_oid
                  LEFT JOIN pg_roles roles ON roles.oid=role_oid
                  ORDER BY CASE WHEN role_oid=0 THEN 'public' ELSE roles.rolname END
                )) AS roles,
                pg_get_expr(policies.polqual,policies.polrelid) AS using_expression,
                pg_get_expr(policies.polwithcheck,policies.polrelid) AS check_expression
         FROM pg_policy policies
         JOIN pg_class tables ON tables.oid=policies.polrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         WHERE namespaces.nspname='public' AND tables.relname=ANY($1::text[])
         ORDER BY tables.relname,policies.polname`,
        [DOCUMENT_EVIDENCE_TABLES]
      )
    ).rows,
    ['using_expression', 'check_expression']
  );
  const tablePrivileges = (
    await client.query<CatalogRow>(
      `SELECT tables.relname AS table_name,
              CASE WHEN privileges.grantee=0 THEN 'public' ELSE grantees.rolname END AS grantee,
              privileges.privilege_type,privileges.is_grantable
       FROM pg_class tables
       JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(tables.relacl,acldefault('r',tables.relowner))) privileges
       LEFT JOIN pg_roles grantees ON grantees.oid=privileges.grantee
       WHERE namespaces.nspname='public' AND tables.relname=ANY($1::text[])
         AND privileges.grantee <> tables.relowner
       ORDER BY tables.relname,grantee,privileges.privilege_type`,
      [DOCUMENT_EVIDENCE_TABLES]
    )
  ).rows;
  const rawFunctions = (
    await client.query<
      CatalogRow & { function_body: string; function_oid: string; function_name: string }
    >(
      `SELECT procedures.oid::text AS function_oid,procedures.proname AS function_name,
              procedures.proname || '(' || pg_get_function_identity_arguments(procedures.oid) || ')'
                AS signature,
              pg_get_function_result(procedures.oid) AS result_type,
              languages.lanname AS language,procedures.prosecdef AS security_definer,
              procedures.provolatile AS volatility,procedures.proisstrict AS strict,
              COALESCE(to_json(procedures.proconfig),'[]'::json) AS configuration,
              procedures.prosrc AS function_body
       FROM pg_proc procedures
       JOIN pg_namespace namespaces ON namespaces.oid=procedures.pronamespace
       JOIN pg_language languages ON languages.oid=procedures.prolang
       WHERE namespaces.nspname='public' AND procedures.proname=ANY($1::text[])
       ORDER BY procedures.proname,pg_get_function_identity_arguments(procedures.oid)`,
      [DOCUMENT_EVIDENCE_FUNCTIONS]
    )
  ).rows;
  const functions = rawFunctions.map(({ function_body, function_oid: _oid, ...row }) => ({
    ...row,
    function_body_sha256: createHash('sha256')
      .update(function_body.replace(/\r\n/gu, '\n').trim())
      .digest('hex'),
  }));
  const functionPrivileges = (
    await client.query<CatalogRow>(
      `SELECT procedures.proname || '(' || pg_get_function_identity_arguments(procedures.oid) || ')'
                AS signature,
              CASE WHEN privileges.grantee=0 THEN 'public' ELSE grantees.rolname END AS grantee,
              privileges.privilege_type,privileges.is_grantable
       FROM pg_proc procedures
       JOIN pg_namespace namespaces ON namespaces.oid=procedures.pronamespace
       CROSS JOIN LATERAL aclexplode(
         COALESCE(procedures.proacl,acldefault('f',procedures.proowner))
       ) privileges
       LEFT JOIN pg_roles grantees ON grantees.oid=privileges.grantee
       WHERE namespaces.nspname='public' AND procedures.proname=ANY($1::text[])
         AND privileges.grantee <> procedures.proowner
       ORDER BY signature,grantee,privileges.privilege_type`,
      [DOCUMENT_EVIDENCE_FUNCTIONS]
    )
  ).rows;
  return {
    tables,
    columns,
    constraints,
    indexes,
    triggers,
    policies,
    tablePrivileges,
    functions,
    functionPrivileges,
  };
}

export async function digestDocumentEvidenceSecurityManifest(client: Client): Promise<string> {
  return createHash('sha256')
    .update(JSON.stringify(await readDocumentEvidenceSecurityManifest(client)))
    .digest('hex');
}

async function assertDocumentEvidenceSecurityManifest(
  client: Client,
  version: keyof typeof DOCUMENT_EVIDENCE_SECURITY_MANIFEST_SHA256
): Promise<void> {
  const digest = await digestDocumentEvidenceSecurityManifest(client);
  const allowed: readonly string[] = DOCUMENT_EVIDENCE_SECURITY_MANIFEST_SHA256[version];
  if (!allowed.includes(digest)) {
    throw new Error(`Live document evidence security manifest does not match ${version}`);
  }
}

async function assertLiveMigration(client: Client, version: string): Promise<void> {
  if (version === '20260711120000') {
    await assertRelations(
      client,
      [
        'document_evidence_runs',
        'document_evidence_items',
        'document_evidence_batch_checkpoints',
        'document_evidence_conflicts',
        'document_evidence_decisions',
      ],
      version
    );
    await assertProcedures(
      client,
      [
        'create_or_reuse_document_evidence_run(uuid,uuid,text,text,jsonb)',
        'persist_document_evidence_items(uuid,uuid,uuid,jsonb)',
        'finalize_document_evidence_run(uuid,uuid,uuid,text)',
        'append_document_evidence_decision(jsonb)',
      ],
      version
    );
    await assertDocumentEvidenceSecurityManifest(client, version);
    return;
  }
  if (version === '20260711130000') {
    await assertRelations(
      client,
      ['document_evidence_conflict_checkpoints', 'document_evidence_retry_applications'],
      version
    );
    for (const [table, column] of [
      ['document_evidence_conflicts', 'semantic_payload_hash'],
      ['document_evidence_decisions', 'subject_kind'],
      ['document_evidence_decisions', 'idempotency_key'],
    ]) {
      if (!(await columnExists(client, table, column))) {
        throw new Error(`Live document evidence columns do not match migration ${version}`);
      }
    }
    await assertIndexes(
      client,
      [
        'document_evidence_decisions_one_subject_chain_root',
        'document_evidence_decisions_idempotency_unique',
        'clarifying_questions_document_evidence_subject_unique',
      ],
      version
    );
    await assertClarifyingSubjectIndex(client);
    await assertPgcryptoDigestDependency(client);
    await assertProcedures(
      client,
      [
        'materialize_document_evidence_decision_gate_atomic(uuid,uuid,uuid,text,jsonb,uuid)',
        'answer_document_evidence_question_atomic(uuid,text,text,integer,uuid,uuid,uuid)',
        'answer_document_evidence_questions_atomic(uuid,jsonb,uuid)',
        'record_document_evidence_automatic_retry(uuid,uuid,uuid,uuid,integer,uuid)',
      ],
      version
    );
    await assertDocumentEvidenceSecurityManifest(client, version);
    return;
  }
  if (!(await columnExists(client, 'document_evidence_decisions', 'selected_side_handle'))) {
    throw new Error(`Live document evidence side identity does not match migration ${version}`);
  }
  await assertProcedures(client, ['document_evidence_conflict_side_handle(uuid,jsonb)'], version);
  await assertClarifyingSubjectIndex(client);
  await assertPgcryptoDigestDependency(client);
  const constraints = await client.query<{ name: string }>(
    `SELECT conname AS name FROM pg_constraint
     WHERE conrelid='public.document_evidence_decisions'::regclass
       AND conname=ANY($1::text[])`,
    [
      [
        'document_evidence_decisions_side_handle_format',
        'document_evidence_decisions_side_handle_shape',
      ],
    ]
  );
  if (constraints.rows.length !== 2) {
    throw new Error(`Live document evidence side constraints do not match migration ${version}`);
  }
  const trigger = await client.query<{ present: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.document_evidence_conflicts'::regclass
        AND tgname='validate_document_evidence_conflict_side_identity' AND NOT tgisinternal
    ) AS present
  `);
  if (!trigger.rows[0]?.present) {
    throw new Error(`Live document evidence side trigger does not match migration ${version}`);
  }
  await assertDocumentEvidenceSecurityManifest(client, version);
}

async function versionSentinelExists(client: Client, version: string): Promise<boolean> {
  if (version === '20260711120000') {
    return relationExists(client, 'public.document_evidence_runs');
  }
  if (version === '20260711130000') {
    return relationExists(client, 'public.document_evidence_conflict_checkpoints');
  }
  return columnExists(client, 'document_evidence_decisions', 'selected_side_handle');
}

async function assertMigrationAbsent(client: Client, version: string): Promise<void> {
  if (await versionSentinelExists(client, version)) {
    throw new Error(`Live document evidence objects exist without migration history ${version}`);
  }
  if (
    version === '20260711120000' &&
    (await relationExists(client, 'public.document_evidence_decisions'))
  ) {
    throw new Error(`Live document evidence residue exists without migration history ${version}`);
  }
  if (
    version === '20260711130000' &&
    (await relationExists(client, 'public.document_evidence_retry_applications'))
  ) {
    throw new Error(
      `Live document evidence conflict residue exists without migration history ${version}`
    );
  }
  if (
    version === '20260711130000' &&
    (await relationExists(client, 'public.clarifying_questions_document_evidence_subject_unique'))
  ) {
    throw new Error(
      `Live clarifying document evidence subject index exists without migration history ${version}`
    );
  }
  if (
    version === '20260711140000' &&
    (
      await client.query<{ procedure: string | null }>(
        `SELECT to_regprocedure('public.document_evidence_conflict_side_handle(uuid,jsonb)')::text AS procedure`
      )
    ).rows[0]?.procedure
  ) {
    throw new Error(
      `Live document evidence side function exists without migration history ${version}`
    );
  }
  if (version in DOCUMENT_EVIDENCE_ABSENT_SECURITY_MANIFEST_SHA256) {
    const digest = await digestDocumentEvidenceSecurityManifest(client);
    const allowed: readonly string[] =
      DOCUMENT_EVIDENCE_ABSENT_SECURITY_MANIFEST_SHA256[
        version as keyof typeof DOCUMENT_EVIDENCE_ABSENT_SECURITY_MANIFEST_SHA256
      ];
    if (!allowed.includes(digest)) {
      throw new Error(`Live document evidence security manifest contains residue for ${version}`);
    }
  }
}

async function assertApprovedHistoryTopology(
  client: Client,
  migrations: LoadedMigration[]
): Promise<void> {
  let missingEarlier = false;
  for (const migration of migrations) {
    const history = await readHistory(client, migration.version);
    if (!history) {
      missingEarlier = true;
      continue;
    }
    assertExactHistory(history, migration);
    if (missingEarlier) {
      throw new Error('Approved document evidence migration history is not a supported prefix');
    }
  }
}

async function assertNoDownstreamLiveObjects(client: Client): Promise<void> {
  const result = await client.query<{
    relations: string[];
    functions: string[];
    triggers: string[];
  }>(
    `SELECT
       to_json(ARRAY(
         SELECT classes.relname
         FROM pg_class classes
         JOIN pg_namespace namespaces ON namespaces.oid=classes.relnamespace
         WHERE namespaces.nspname='public' AND classes.relname=ANY($1::text[])
         ORDER BY classes.relname
       )) AS relations,
       to_json(ARRAY(
         SELECT procedures.proname || '(' || pg_get_function_identity_arguments(procedures.oid) || ')'
         FROM pg_proc procedures
         JOIN pg_namespace namespaces ON namespaces.oid=procedures.pronamespace
         WHERE namespaces.nspname='public' AND procedures.proname=ANY($2::text[])
         ORDER BY procedures.proname,pg_get_function_identity_arguments(procedures.oid)
       )) AS functions,
       to_json(ARRAY(
         SELECT triggers.tgname
         FROM pg_trigger triggers
         JOIN pg_class tables ON tables.oid=triggers.tgrelid
         JOIN pg_namespace namespaces ON namespaces.oid=tables.relnamespace
         WHERE namespaces.nspname='public' AND NOT triggers.tgisinternal
           AND triggers.tgname=ANY($3::text[])
         ORDER BY triggers.tgname
       )) AS triggers`,
    [
      DOCUMENT_EVIDENCE_DOWNSTREAM_RELATIONS,
      DOCUMENT_EVIDENCE_DOWNSTREAM_FUNCTIONS,
      DOCUMENT_EVIDENCE_DOWNSTREAM_TRIGGERS,
    ]
  );
  const row = result.rows[0];
  if (row && (row.relations.length > 0 || row.functions.length > 0 || row.triggers.length > 0)) {
    throw new Error('Refusing base rollback while downstream live objects remain');
  }
}

async function insertHistory(client: Client, migration: LoadedMigration): Promise<void> {
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
     VALUES($1,$2,$3::text[])`,
    [migration.version, migration.name, migration.apply.statements]
  );
}

async function applyMigration(
  client: Client,
  migration: LoadedMigration
): Promise<'applied' | 'reused' | 'recovered'> {
  const history = await readHistory(client, migration.version);
  if (history) {
    assertExactHistory(history, migration);
    await assertLiveMigration(client, migration.version);
    return 'reused';
  }
  const live = await versionSentinelExists(client, migration.version);
  if (live) {
    await assertLiveMigration(client, migration.version);
    await client.query('BEGIN');
    try {
      await insertHistory(client, migration);
      await client.query('COMMIT');
      return 'recovered';
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  await assertMigrationAbsent(client, migration.version);
  await client.query('BEGIN');
  try {
    for (const statement of migration.apply.statements) await client.query(statement);
    await assertLiveMigration(client, migration.version);
    await insertHistory(client, migration);
    await client.query('COMMIT');
    return 'applied';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function rollbackMigration(
  client: Client,
  migration: LoadedMigration
): Promise<'rolled_back' | 'reused' | 'recovered'> {
  const history = await readHistory(client, migration.version);
  const live = await versionSentinelExists(client, migration.version);
  if (!history) {
    await assertMigrationAbsent(client, migration.version);
    return 'reused';
  }
  assertExactHistory(history, migration);
  if (live) await assertLiveMigration(client, migration.version);
  else await assertMigrationAbsent(client, migration.version);
  await client.query('BEGIN');
  try {
    if (live) {
      for (const statement of migration.rollback.statements) await client.query(statement);
      await assertMigrationAbsent(client, migration.version);
    }
    const deleted = await client.query(
      `DELETE FROM supabase_migrations.schema_migrations
       WHERE version=$1 AND name=$2 AND statements=$3::text[]`,
      [migration.version, migration.name, migration.apply.statements]
    );
    if (deleted.rowCount !== 1) {
      throw new Error(`Supabase migration history ${migration.version} changed during rollback`);
    }
    await client.query('COMMIT');
    return live ? 'rolled_back' : 'recovered';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function combinedResult(results: MigrationResult[], direction: Direction): MigrationResult {
  if (results.every(result => result === 'reused')) return 'reused';
  const exact = direction === 'apply' ? 'applied' : 'rolled_back';
  if (results.every(result => result === exact)) return exact;
  return 'recovered';
}

// ---------------------------------------------------------------------------
// Q12 same-transaction guard publication.
//
// The frozen W barrier (`q12_guard.extend_guard`) installs row/TRUNCATE guards
// on the exact newly created relations recorded in the stored expected catalog
// and appends a `migration_guards` row. The migration reads those exact
// relations/hashes from `q12_guard.active_run` (owned by postgres, readable by
// the direct migration session) and passes them back; `extend_guard`
// re-validates them against `pg_class`. Guard installation happens inside the
// same transaction as the migration DDL/data and grants, before COMMIT, so the
// new tables and their guards become visible atomically — there is no committed
// window in which a granted table lacks its write barrier.
// ---------------------------------------------------------------------------

export type Q12GuardMigrationKey = '20260711140000' | '20260711151000';

export interface Q12GuardInputs {
  relations: unknown;
  migrationFileSha256: string;
  catalogSha256: string;
}

export async function readQ12GuardInputs(
  client: Client,
  migrationKey: Q12GuardMigrationKey
): Promise<Q12GuardInputs> {
  const result = await client.query<{
    relations: unknown;
    file_sha256: string | null;
    catalog_sha256: string | null;
  }>(
    `SELECT expected_catalog->'migrations'->$1->'relations' AS relations,
            expected_catalog->'migrations'->$1->>'migration_file_sha256' AS file_sha256,
            expected_catalog->'migrations'->$1->>'catalog_sha256' AS catalog_sha256
     FROM q12_guard.active_run WHERE singleton`,
    [migrationKey]
  );
  const row = result.rows[0];
  if (!row || row.relations == null || !row.file_sha256 || !row.catalog_sha256) {
    throw new Error(
      `Q12 database barrier is missing the expected guard catalog for migration ${migrationKey}`
    );
  }
  return {
    relations: row.relations,
    migrationFileSha256: row.file_sha256,
    catalogSha256: row.catalog_sha256,
  };
}

export async function extendQ12Guard(
  client: Client,
  migrationKey: Q12GuardMigrationKey,
  inputs: Q12GuardInputs
): Promise<void> {
  await client.query('SELECT q12_guard.extend_guard($1, $2::jsonb, $3, $4)', [
    migrationKey,
    JSON.stringify(inputs.relations),
    inputs.migrationFileSha256,
    inputs.catalogSha256,
  ]);
}

// Apply the three base migrations as one atomic transaction so the guard the W
// barrier extends over their new tables becomes visible in the same commit as
// their grants. Because the fixed migration files interleave grants with DDL,
// statements run in file order and the guard is installed after them but before
// COMMIT; the atomic commit is what prevents any observable granted-but-unguarded
// window.
export async function applyQ12BasePacket(
  client: Client,
  migrations: LoadedMigration[]
): Promise<MigrationResult> {
  const guardInputs = await readQ12GuardInputs(client, '20260711140000');
  await client.query('BEGIN');
  try {
    for (const migration of migrations) {
      await assertMigrationAbsent(client, migration.version);
      for (const statement of migration.apply.statements) await client.query(statement);
    }
    await extendQ12Guard(client, '20260711140000', guardInputs);
    for (const migration of migrations) {
      await assertLiveMigration(client, migration.version);
      await insertHistory(client, migration);
    }
    await client.query('COMMIT');
    return 'applied';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function runDocumentEvidenceApprovedMigrations(
  options: DocumentEvidenceApprovedMigrationOptions
): Promise<MigrationResult> {
  const source = resolveMigrationConnectionSource(options);
  if (source.kind === 'url') {
    validateDocumentEvidenceApprovedMigrationTarget(
      source.connectionString,
      options.direction,
      options
    );
  }
  const migrations = await loadDocumentEvidenceApprovedMigrations();
  const client =
    source.kind === 'q12'
      ? new Client(source.context.clientConfig)
      : new Client({ connectionString: source.connectionString });
  await client.connect();
  try {
    if (source.kind === 'q12') await bindQ12MigrationSession(client, source.context.capability);
    await requireSupabaseHistory(client);
    await client.query('SELECT pg_advisory_lock($1::bigint)', ['20260711120000']);
    try {
      const repositoryPrefix = await assertRepositoryMigrationFrontier(client, migrations);
      await assertApprovedHistoryTopology(client, migrations);
      if (options.direction === 'rollback' && repositoryPrefix > migrations.length) {
        throw new Error(
          'Refusing base rollback while downstream 20260711150000/20260711151000 migrations remain'
        );
      }
      if (options.direction === 'rollback') await assertNoDownstreamLiveObjects(client);
      if (source.kind === 'q12' && options.direction === 'apply') {
        return await applyQ12BasePacket(client, migrations);
      }
      // Q12 rollback reuses the ordinary per-migration path on the
      // capability-bound client: it removes only the application tables and
      // their history. It deliberately never touches q12_guard.*, because the W
      // barrier's enforce trigger makes migration_guards INSERT-only and the
      // frozen contract tears the guard schema down only through the
      // q12-database-barrier.sh rollback/cleanup drop_schema=true path
      // (DROP EVENT TRIGGER + DROP SCHEMA q12_guard CASCADE with a residue
      // check), never from the migration.
      const ordered = options.direction === 'apply' ? migrations : [...migrations].reverse();
      const results: MigrationResult[] = [];
      for (const migration of ordered) {
        results.push(
          options.direction === 'apply'
            ? await applyMigration(client, migration)
            : await rollbackMigration(client, migration)
        );
      }
      return combinedResult(results, options.direction);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', ['20260711120000']);
    }
  } finally {
    await client.end();
  }
}

export interface Q12MigrationCliFlags {
  dbUrlFile: string;
  caFile: string;
  capabilityFile: string;
}

// Pure extraction of the Q12 file-only flags. Returns null when none are
// present (ordinary URL mode) and throws fail-closed on a partial set or on any
// URI-shaped argument supplied alongside them.
export function parseQ12MigrationCliFlags(args: readonly string[]): Q12MigrationCliFlags | null {
  const flagNames: Record<string, keyof Q12MigrationCliFlags> = {
    '--db-url-file': 'dbUrlFile',
    '--ca-file': 'caFile',
    '--q12-db-capability-file': 'capabilityFile',
  };
  const collected: Partial<Q12MigrationCliFlags> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = flagNames[args[index]];
    if (!key) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Q12 migration flag ${args[index]} requires a path value`);
    }
    collected[key] = value;
    index += 1;
  }
  const present = Object.keys(collected).length;
  if (present === 0) return null;
  if (present < 3) {
    throw new Error(
      'Q12 migration mode requires --db-url-file, --ca-file, and --q12-db-capability-file together'
    );
  }
  if (args.some(arg => arg.includes('://'))) {
    throw new Error('Q12 migration mode rejects any database URI argument');
  }
  return collected as Q12MigrationCliFlags;
}

function parseCliArguments(args: string[]): {
  direction: Direction;
  allowRemote: boolean;
  confirmation?: string;
} {
  const action = args.shift();
  if (action !== 'apply' && action !== 'rollback') {
    throw new Error('Usage: document-evidence-approved <apply|rollback>');
  }
  let allowRemote = false;
  let confirmation: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--allow-remote') allowRemote = true;
    else if (flag === '--confirm' && args.length > 0) confirmation = args.shift();
    else if (
      flag === '--db-url-file' ||
      flag === '--ca-file' ||
      flag === '--q12-db-capability-file'
    ) {
      args.shift();
    } else throw new Error('Approved document evidence migration received an unsupported argument');
  }
  return { direction: action, allowRemote, ...(confirmation ? { confirmation } : {}) };
}

export type DocumentEvidenceApprovedCliResolution =
  | { mode: 'q12'; files: Q12MigrationCliFlags; direction: Direction }
  | {
      mode: 'url';
      databaseUrl: string;
      direction: Direction;
      allowRemote: boolean;
      confirmation?: string;
    };

// Pure CLI resolution (no filesystem, no connection): the seam the wiring is
// tested through. Q12 file-only mode and an ordinary SUPABASE_DB_URL are
// mutually exclusive and fail closed.
export function resolveDocumentEvidenceApprovedCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv
): DocumentEvidenceApprovedCliResolution {
  const parsed = parseCliArguments([...args]);
  const q12Files = parseQ12MigrationCliFlags(args);
  if (q12Files) {
    assertNoQ12UrlEnvironmentOrArgument(env, args);
    return { mode: 'q12', files: q12Files, direction: parsed.direction };
  }
  const databaseUrl = env.SUPABASE_DB_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('SUPABASE_DB_URL is required');
  }
  return {
    mode: 'url',
    databaseUrl,
    direction: parsed.direction,
    allowRemote: parsed.allowRemote,
    ...(parsed.confirmation ? { confirmation: parsed.confirmation } : {}),
  };
}

async function main(): Promise<void> {
  const resolution = resolveDocumentEvidenceApprovedCli(process.argv.slice(2), process.env);
  let result: MigrationResult;
  if (resolution.mode === 'q12') {
    const { clientConfig, capability } = await loadQ12MigrationCredentials(resolution.files);
    result = await runDocumentEvidenceApprovedMigrations({
      q12: { clientConfig, capability },
      direction: resolution.direction,
    });
  } else {
    result = await runDocumentEvidenceApprovedMigrations({
      databaseUrl: resolution.databaseUrl,
      direction: resolution.direction,
      allowRemote: resolution.allowRemote,
      ...(resolution.confirmation ? { confirmation: resolution.confirmation } : {}),
    });
  }
  process.stdout.write(`Approved document evidence migration ${resolution.direction}: ${result}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))
) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : 'Unknown migration failure';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
