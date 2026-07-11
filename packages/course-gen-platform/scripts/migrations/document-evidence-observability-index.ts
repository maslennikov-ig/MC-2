import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

export const DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION = '20260711150000';
export const DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME = 'document_evidence_observability_index';
export const DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION = {
  apply: 'APPLY REMOTE DOCUMENT EVIDENCE INDEX 20260711150000',
  rollback: 'ROLL BACK REMOTE DOCUMENT EVIDENCE INDEX 20260711150000',
} as const;
export const DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION = {
  apply: 'APPLY REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711150000 20260711151000',
  rollback: 'ROLL BACK REMOTE DOCUMENT EVIDENCE OBSERVABILITY 20260711151000 20260711150000',
} as const;
const DOCUMENT_EVIDENCE_TOTALS_MIGRATION_VERSION = '20260711151000';
const DOCUMENT_EVIDENCE_TOTALS_MIGRATION_NAME = 'document_evidence_observability_totals';
const TOTALS_FORWARD_SHA256 = '5f675b1a8a933128520b2fb9d42632a9cbefff2e57ec72f06cd42cd6e0a090e3';
const TOTALS_ROLLBACK_SHA256 = '2187f97fb3949d1d61a7804562391a8ff40e569ec33d0288ab2da3253f292248';

const INDEX_NAME = 'idx_clarifying_pending_critical_evidence_created_at';
const INDEX_COMMENT =
  'Covers exact count and oldest-first reconciliation for pending critical document conflicts.';
const ADVISORY_LOCK_KEY = DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION;
const FORWARD_SOURCE = `-- Bound the global unresolved-critical evidence reconciliation used by textfile metrics.
-- This migration must be executed statement-by-statement in autocommit mode.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clarifying_pending_critical_evidence_created_at
  ON public.clarifying_questions (created_at)
  WHERE question_category = 'document_conflicts'
    AND question_priority = 'critical'
    AND status = 'pending';

COMMENT ON INDEX public.idx_clarifying_pending_critical_evidence_created_at IS
  'Covers exact count and oldest-first reconciliation for pending critical document conflicts.';
`;
const ROLLBACK_SOURCE = `-- This rollback must be executed statement-by-statement in autocommit mode.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_clarifying_pending_critical_evidence_created_at;
`;

// Matches Supabase CLI v2.106.0 parser.SplitAndTrim for these fixed, allowlisted files.
const FORWARD_STATEMENTS = FORWARD_SOURCE.split(';')
  .map(value => value.trim())
  .filter(Boolean);
const ROLLBACK_STATEMENTS = ROLLBACK_SOURCE.split(';')
  .map(value => value.trim())
  .filter(Boolean);

type Direction = 'apply' | 'rollback';
type RemoteGate = { allowRemote?: boolean; confirmation?: string };
type RemoteConfirmations = Readonly<Record<Direction, string>>;
type MigrationSpec = { version: string; name: string; statements: string[] };

export interface DocumentEvidenceIndexMigrationOptions extends RemoteGate {
  databaseUrl: string;
  direction: Direction;
}

export type DocumentEvidenceObservabilityMigrationOptions = DocumentEvidenceIndexMigrationOptions;

type HistoryRow = { version: string; name: string | null; statements: string[] | null };
type IndexState = {
  definition: string;
  predicate: string;
  access_method: string;
  columns: string[];
  indisvalid: boolean;
  indisready: boolean;
  indislive: boolean;
  indisunique: boolean;
  indnkeyatts: number;
  indnatts: number;
  comment: string | null;
};

function isLoopback(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
}

function validateMigrationTarget(
  databaseUrl: string,
  direction: Direction,
  gate: RemoteGate,
  confirmations: RemoteConfirmations
): URL {
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error('Document evidence migration database URL is invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('Document evidence migration requires a PostgreSQL URL');
  }
  if (isLoopback(target.hostname)) return target;
  if (!gate.allowRemote) {
    throw new Error('Document evidence migration remote targets are disabled by default');
  }
  if (gate.confirmation !== confirmations[direction]) {
    throw new Error('Document evidence migration remote confirmation does not match');
  }
  if (target.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('Document evidence migration remote targets require sslmode=verify-full');
  }
  return target;
}

export function validateDocumentEvidenceMigrationTarget(
  databaseUrl: string,
  direction: Direction,
  gate: RemoteGate
): URL {
  return validateMigrationTarget(
    databaseUrl,
    direction,
    gate,
    DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION
  );
}

export function validateDocumentEvidenceObservabilityMigrationTarget(
  databaseUrl: string,
  direction: Direction,
  gate: RemoteGate
): URL {
  return validateMigrationTarget(
    databaseUrl,
    direction,
    gate,
    DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION
  );
}

function migrationSourceUrl(direction: Direction): URL {
  return new URL(
    direction === 'apply'
      ? '../../supabase/migrations/20260711150000_document_evidence_observability_index.sql'
      : '../../supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql',
    import.meta.url
  );
}

function totalsMigrationSourceUrl(direction: Direction): URL {
  return new URL(
    direction === 'apply'
      ? '../../supabase/migrations/20260711151000_document_evidence_observability_totals.sql'
      : '../../supabase/migrations/rollback/20260711151000_document_evidence_observability_totals_rollback.sql',
    import.meta.url
  );
}

// Compatible with Supabase CLI v2.106.0 parser.SplitAndTrim for the fixed SQL used here.
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
      } else if (current === ';') {
        emit(index + 1);
      } else if (current === '\\') {
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

async function loadTotalsMigration(direction: Direction): Promise<{
  source: string;
  statements: string[];
}> {
  const source = await readFile(totalsMigrationSourceUrl(direction), 'utf8');
  const digest = createHash('sha256').update(source).digest('hex');
  const expected = direction === 'apply' ? TOTALS_FORWARD_SHA256 : TOTALS_ROLLBACK_SHA256;
  if (digest !== expected) {
    throw new Error('Document evidence totals migration source differs from the fixed allowlist');
  }
  return { source, statements: splitSupabaseStatements(source) };
}

async function assertAllowlistedSource(direction: Direction): Promise<void> {
  const source = await readFile(migrationSourceUrl(direction), 'utf8');
  const expected = direction === 'apply' ? FORWARD_SOURCE : ROLLBACK_SOURCE;
  if (source !== expected) {
    throw new Error('Document evidence migration source differs from the fixed allowlist');
  }
}

async function requireSupabaseHistory(client: Client): Promise<void> {
  const relation = await client.query<{ relation: string | null }>(
    `SELECT to_regclass('supabase_migrations.schema_migrations')::text AS relation`
  );
  if (relation.rows[0]?.relation !== 'supabase_migrations.schema_migrations') {
    throw new Error('Existing Supabase migration history is required');
  }
  const columns = await client.query<{ column_name: string; data_type: string }>(`
    SELECT column_name,data_type
    FROM information_schema.columns
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
  const result = await client.query<HistoryRow>(
    `SELECT version,name,statements
     FROM supabase_migrations.schema_migrations
     WHERE version=$1`,
    [version]
  );
  return result.rows[0];
}

function assertExactHistory(row: HistoryRow, spec: MigrationSpec): void {
  if (
    row.name !== spec.name ||
    JSON.stringify(row.statements) !== JSON.stringify(spec.statements)
  ) {
    throw new Error('Supabase migration history row does not match the fixed migration');
  }
}

async function readIndex(client: Client): Promise<IndexState | undefined> {
  const result = await client.query<IndexState>(
    `SELECT
       pg_get_indexdef(indexes.indexrelid) AS definition,
       pg_get_expr(indexes.indpred, indexes.indrelid) AS predicate,
       methods.amname AS access_method,
       to_json(ARRAY(
         SELECT attributes.attname
         FROM unnest(indexes.indkey) WITH ORDINALITY keys(attnum, position)
         JOIN pg_attribute attributes
           ON attributes.attrelid=indexes.indrelid AND attributes.attnum=keys.attnum
         ORDER BY keys.position
       )) AS columns,
       indexes.indisvalid,indexes.indisready,indexes.indislive,indexes.indisunique,
       indexes.indnkeyatts,indexes.indnatts,
       obj_description(indexes.indexrelid, 'pg_class') AS comment
     FROM pg_index indexes
     JOIN pg_class index_rel ON index_rel.oid=indexes.indexrelid
     JOIN pg_class table_rel ON table_rel.oid=indexes.indrelid
     JOIN pg_namespace index_ns ON index_ns.oid=index_rel.relnamespace
     JOIN pg_namespace table_ns ON table_ns.oid=table_rel.relnamespace
     JOIN pg_am methods ON methods.oid=index_rel.relam
     WHERE index_ns.nspname='public' AND index_rel.relname=$1
       AND table_ns.nspname='public' AND table_rel.relname='clarifying_questions'`,
    [INDEX_NAME]
  );
  return result.rows[0];
}

function assertExactIndex(index: IndexState, requireComment = true): void {
  const normalizedPredicate = index.predicate.replace(/\s+/gu, ' ');
  const exactPredicate =
    "((question_category = 'document_conflicts'::text) AND (question_priority = 'critical'::text) AND (status = 'pending'::text))";
  if (
    !index.definition.startsWith(
      `CREATE INDEX ${INDEX_NAME} ON public.clarifying_questions USING btree (created_at) WHERE `
    ) ||
    normalizedPredicate !== exactPredicate ||
    index.access_method !== 'btree' ||
    JSON.stringify(index.columns) !== JSON.stringify(['created_at']) ||
    !index.indisvalid ||
    !index.indisready ||
    !index.indislive ||
    index.indisunique ||
    index.indnkeyatts !== 1 ||
    index.indnatts !== 1 ||
    (requireComment && index.comment !== INDEX_COMMENT)
  ) {
    throw new Error(
      'Live document evidence observability index does not match the fixed definition'
    );
  }
}

async function apply(client: Client): Promise<'applied' | 'reused' | 'recovered'> {
  const history = await readHistory(client, DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION);
  let before = await readIndex(client);
  if (history) {
    assertExactHistory(history, {
      version: DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION,
      name: DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME,
      statements: FORWARD_STATEMENTS,
    });
    if (!before) throw new Error('Migration history exists but the live index is missing');
    assertExactIndex(before);
    return 'reused';
  }
  let removedInvalidResidue = false;
  if (before && (!before.indisvalid || !before.indisready || !before.indislive)) {
    await client.query(`DROP INDEX CONCURRENTLY public.${INDEX_NAME}`);
    before = undefined;
    removedInvalidResidue = true;
  }
  if (before) assertExactIndex(before, false);
  for (const statement of FORWARD_STATEMENTS) await client.query(statement);
  const after = await readIndex(client);
  if (!after) throw new Error('Document evidence observability index was not created');
  assertExactIndex(after);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
     VALUES($1,$2,$3::text[])`,
    [
      DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION,
      DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME,
      FORWARD_STATEMENTS,
    ]
  );
  return before || removedInvalidResidue ? 'recovered' : 'applied';
}

async function rollback(client: Client): Promise<'rolled_back' | 'recovered' | 'reused'> {
  const history = await readHistory(client, DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION);
  const before = await readIndex(client);
  if (!history) {
    if (before) throw new Error('Live index exists without matching migration history');
    return 'reused';
  }
  assertExactHistory(history, {
    version: DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION,
    name: DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME,
    statements: FORWARD_STATEMENTS,
  });
  if (before) {
    assertExactIndex(before);
    for (const statement of ROLLBACK_STATEMENTS) await client.query(statement);
  }
  if (await readIndex(client)) {
    throw new Error('Document evidence observability index rollback did not remove the index');
  }
  const deleted = await client.query(
    `DELETE FROM supabase_migrations.schema_migrations
     WHERE version=$1 AND name=$2 AND statements=$3::text[]`,
    [
      DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION,
      DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME,
      FORWARD_STATEMENTS,
    ]
  );
  if (deleted.rowCount !== 1) {
    throw new Error('Supabase migration history changed during rollback');
  }
  return before ? 'rolled_back' : 'recovered';
}

const TOTALS_COLUMNS = [
  'singleton',
  'generation',
  'revision',
  'accepted_runs',
  'failed_runs',
  'source_documents',
  'assessed_documents',
  'degraded_documents',
  'failed_documents',
  'latest_coverage_source',
  'latest_coverage_assessed',
  'latest_coverage_degraded',
  'latest_coverage_failed',
  'latest_coverage_completed_at',
  'latest_coverage_run_id',
  'full_text_documents',
  'hierarchical_summary_documents',
  'summary_documents',
  'targeted_retrieval_documents',
  'metadata_only_documents',
  'batches',
  'model_calls',
  'input_tokens',
  'output_tokens',
  'total_cost_usd',
  'duration_seconds',
  'critical_conflicts',
  'important_conflicts',
  'informational_conflicts',
  'user_decisions',
  'system_decisions',
  'degraded_automatic_decisions',
] as const;
const TOTALS_TRIGGERS = [
  'increment_document_evidence_terminal_totals',
  'increment_document_evidence_terminal_insert_totals',
  'increment_document_evidence_checkpoint_totals',
  'increment_document_evidence_conflict_totals',
  'increment_document_evidence_observability_totals',
] as const;

async function totalsRelationExists(client: Client): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>(
    "SELECT to_regclass('public.document_evidence_observability_totals')::text AS relation"
  );
  return result.rows[0]?.relation === 'document_evidence_observability_totals';
}

async function assertExactTotals(client: Client): Promise<void> {
  if (!(await totalsRelationExists(client))) {
    throw new Error('Totals migration history exists but the live singleton is missing');
  }
  const relation = await client.query<{
    columns: string[];
    relrowsecurity: boolean;
    comment: string | null;
    service_role_select: boolean;
    singleton_count: string;
  }>(`
    SELECT
      to_json(ARRAY(
        SELECT attname FROM pg_attribute
        WHERE attrelid='public.document_evidence_observability_totals'::regclass
          AND attnum > 0 AND NOT attisdropped ORDER BY attnum
      )) AS columns,
      relrowsecurity,
      obj_description(oid, 'pg_class') AS comment,
      has_table_privilege('service_role', oid, 'SELECT') AS service_role_select,
      (SELECT count(*)::text FROM public.document_evidence_observability_totals) AS singleton_count
    FROM pg_class
    WHERE oid='public.document_evidence_observability_totals'::regclass
  `);
  const row = relation.rows[0];
  if (
    !row ||
    JSON.stringify(row.columns) !== JSON.stringify(TOTALS_COLUMNS) ||
    !row.relrowsecurity ||
    row.comment !==
      'Revisioned trigger-maintained absolute counters for O(1) Stage 4 reconciliation.' ||
    !row.service_role_select ||
    row.singleton_count !== '1'
  ) {
    throw new Error(
      'Live document evidence observability totals do not match the fixed definition'
    );
  }
  const triggers = await client.query<{
    name: string;
    security_definer: boolean;
    deferrable: boolean;
    initially_deferred: boolean;
  }>(
    `
      SELECT triggers.tgname AS name, procedures.prosecdef AS security_definer,
        triggers.tgdeferrable AS deferrable,
        triggers.tginitdeferred AS initially_deferred
    FROM pg_trigger triggers
    JOIN pg_proc procedures ON procedures.oid=triggers.tgfoid
    WHERE triggers.tgrelid IN (
      'public.document_evidence_runs'::regclass,
      'public.document_evidence_conflict_checkpoints'::regclass,
      'public.document_evidence_conflicts'::regclass,
      'public.document_evidence_decisions'::regclass
    ) AND NOT triggers.tgisinternal
      AND triggers.tgname = ANY($1::text[])
    ORDER BY triggers.tgname
  `,
    [TOTALS_TRIGGERS]
  );
  if (
    JSON.stringify(triggers.rows.map(row => row.name)) !==
      JSON.stringify([...TOTALS_TRIGGERS].sort()) ||
    triggers.rows.some(row => !row.security_definer) ||
    triggers.rows.some(row =>
      row.name === 'increment_document_evidence_terminal_insert_totals'
        ? !row.deferrable || !row.initially_deferred
        : row.deferrable || row.initially_deferred
    )
  ) {
    throw new Error(
      'Live document evidence observability triggers do not match the fixed definition'
    );
  }
  const rpc = await client.query<{ security_definer: boolean; service_role_execute: boolean }>(`
    SELECT prosecdef AS security_definer,
      has_function_privilege('service_role', oid, 'EXECUTE') AS service_role_execute
    FROM pg_proc
    WHERE oid='public.get_document_evidence_observability_totals()'::regprocedure
  `);
  if (!rpc.rows[0]?.security_definer || !rpc.rows[0]?.service_role_execute) {
    throw new Error('Live document evidence observability RPC does not match the fixed definition');
  }
}

async function applyTotals(
  client: Client,
  spec: MigrationSpec,
  statements: string[]
): Promise<'applied' | 'reused'> {
  const history = await readHistory(client, spec.version);
  if (history) {
    assertExactHistory(history, spec);
    await assertExactTotals(client);
    return 'reused';
  }
  if (await totalsRelationExists(client)) {
    throw new Error('Live totals singleton exists without matching migration history');
  }
  await client.query('BEGIN');
  try {
    for (const statement of statements) await client.query(statement);
    await assertExactTotals(client);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
       VALUES($1,$2,$3::text[])`,
      [spec.version, spec.name, spec.statements]
    );
    await client.query('COMMIT');
    return 'applied';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function rollbackTotals(
  client: Client,
  spec: MigrationSpec,
  statements: string[]
): Promise<'rolled_back' | 'reused'> {
  const history = await readHistory(client, spec.version);
  if (!history) {
    if (await totalsRelationExists(client)) {
      throw new Error('Live totals singleton exists without matching migration history');
    }
    return 'reused';
  }
  assertExactHistory(history, spec);
  await assertExactTotals(client);
  await client.query('BEGIN');
  try {
    for (const statement of statements) await client.query(statement);
    if (await totalsRelationExists(client)) {
      throw new Error(
        'Document evidence observability totals rollback did not remove the singleton'
      );
    }
    const deleted = await client.query(
      `DELETE FROM supabase_migrations.schema_migrations
       WHERE version=$1 AND name=$2 AND statements=$3::text[]`,
      [spec.version, spec.name, spec.statements]
    );
    if (deleted.rowCount !== 1) throw new Error('Totals migration history changed during rollback');
    await client.query('COMMIT');
    return 'rolled_back';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function assertUnifiedHistory(client: Client, totalsSpec: MigrationSpec): Promise<void> {
  const indexHistory = await readHistory(client, DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION);
  const totalsHistory = await readHistory(client, totalsSpec.version);
  if (indexHistory) {
    assertExactHistory(indexHistory, {
      version: DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION,
      name: DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME,
      statements: FORWARD_STATEMENTS,
    });
  }
  if (totalsHistory) {
    assertExactHistory(totalsHistory, totalsSpec);
    if (!indexHistory) throw new Error('Totals migration history exists before index history');
    await assertExactTotals(client);
  } else if (await totalsRelationExists(client)) {
    throw new Error('Live totals singleton exists without matching migration history');
  }
}

export async function runDocumentEvidenceObservabilityIndexMigration(
  options: DocumentEvidenceIndexMigrationOptions
): Promise<'applied' | 'rolled_back' | 'reused' | 'recovered'> {
  validateDocumentEvidenceMigrationTarget(options.databaseUrl, options.direction, options);
  await assertAllowlistedSource(options.direction);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await requireSupabaseHistory(client);
    await client.query('SELECT pg_advisory_lock($1::bigint)', [ADVISORY_LOCK_KEY]);
    try {
      return options.direction === 'apply' ? await apply(client) : await rollback(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

export async function runDocumentEvidenceObservabilityMigration(
  options: DocumentEvidenceObservabilityMigrationOptions
): Promise<'applied' | 'rolled_back' | 'reused' | 'recovered'> {
  validateDocumentEvidenceObservabilityMigrationTarget(
    options.databaseUrl,
    options.direction,
    options
  );
  await assertAllowlistedSource(options.direction);
  const totalsForward = await loadTotalsMigration('apply');
  const totalsRollback = await loadTotalsMigration('rollback');
  const totalsSpec: MigrationSpec = {
    version: DOCUMENT_EVIDENCE_TOTALS_MIGRATION_VERSION,
    name: DOCUMENT_EVIDENCE_TOTALS_MIGRATION_NAME,
    statements: totalsForward.statements,
  };
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await requireSupabaseHistory(client);
    await client.query('SELECT pg_advisory_lock($1::bigint)', [ADVISORY_LOCK_KEY]);
    try {
      await assertUnifiedHistory(client, totalsSpec);
      if (options.direction === 'apply') {
        const indexResult = await apply(client);
        const totalsResult = await applyTotals(client, totalsSpec, totalsForward.statements);
        if (indexResult === 'reused' && totalsResult === 'reused') return 'reused';
        if (indexResult === 'applied' && totalsResult === 'applied') return 'applied';
        return 'recovered';
      }
      const totalsResult = await rollbackTotals(client, totalsSpec, totalsRollback.statements);
      const indexResult = await rollback(client);
      if (totalsResult === 'reused' && indexResult === 'reused') return 'reused';
      if (totalsResult === 'rolled_back' && indexResult === 'rolled_back') return 'rolled_back';
      return 'recovered';
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

function parseCliArguments(args: string[]): {
  direction: Direction;
  unified: boolean;
  allowRemote: boolean;
  confirmation?: string;
} {
  const action = args.shift();
  const unified = action === 'apply-all' || action === 'rollback-all';
  const direction = action === 'apply' || action === 'apply-all' ? 'apply' : 'rollback';
  if (!['apply', 'rollback', 'apply-all', 'rollback-all'].includes(action ?? '')) {
    throw new Error(
      'Usage: document-evidence-observability-index <apply|rollback|apply-all|rollback-all>'
    );
  }
  let allowRemote = false;
  let confirmation: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--allow-remote') allowRemote = true;
    else if (flag === '--confirm' && args.length > 0) confirmation = args.shift();
    else throw new Error('Document evidence migration received an unsupported argument');
  }
  return { direction, unified, allowRemote, ...(confirmation ? { confirmation } : {}) };
}

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');
  const runner = parsed.unified
    ? runDocumentEvidenceObservabilityMigration
    : runDocumentEvidenceObservabilityIndexMigration;
  const result = await runner({
    databaseUrl,
    direction: parsed.direction,
    allowRemote: parsed.allowRemote,
    ...(parsed.confirmation ? { confirmation: parsed.confirmation } : {}),
  });
  process.stdout.write(
    `Document evidence observability ${parsed.unified ? 'migration' : 'index'} ${parsed.direction}: ${result}\n`
  );
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
