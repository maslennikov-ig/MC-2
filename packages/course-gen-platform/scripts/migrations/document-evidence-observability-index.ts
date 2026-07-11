import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

export const DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION = '20260711150000';
export const DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME = 'document_evidence_observability_index';
export const DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION = {
  apply: 'APPLY REMOTE DOCUMENT EVIDENCE INDEX 20260711150000',
  rollback: 'ROLL BACK REMOTE DOCUMENT EVIDENCE INDEX 20260711150000',
} as const;

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

export interface DocumentEvidenceIndexMigrationOptions extends RemoteGate {
  databaseUrl: string;
  direction: Direction;
}

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

export function validateDocumentEvidenceMigrationTarget(
  databaseUrl: string,
  direction: Direction,
  gate: RemoteGate
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
  if (gate.confirmation !== DOCUMENT_EVIDENCE_INDEX_REMOTE_CONFIRMATION[direction]) {
    throw new Error('Document evidence migration remote confirmation does not match');
  }
  return target;
}

function migrationSourceUrl(direction: Direction): URL {
  return new URL(
    direction === 'apply'
      ? '../../supabase/migrations/20260711150000_document_evidence_observability_index.sql'
      : '../../supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql',
    import.meta.url
  );
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

async function readHistory(client: Client): Promise<HistoryRow | undefined> {
  const result = await client.query<HistoryRow>(
    `SELECT version,name,statements
     FROM supabase_migrations.schema_migrations
     WHERE version=$1`,
    [DOCUMENT_EVIDENCE_INDEX_MIGRATION_VERSION]
  );
  return result.rows[0];
}

function assertExactHistory(row: HistoryRow): void {
  if (
    row.name !== DOCUMENT_EVIDENCE_INDEX_MIGRATION_NAME ||
    JSON.stringify(row.statements) !== JSON.stringify(FORWARD_STATEMENTS)
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
  const history = await readHistory(client);
  let before = await readIndex(client);
  if (history) {
    assertExactHistory(history);
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
  const history = await readHistory(client);
  const before = await readIndex(client);
  if (!history) {
    if (before) throw new Error('Live index exists without matching migration history');
    return 'reused';
  }
  assertExactHistory(history);
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

function parseCliArguments(args: string[]): {
  direction: Direction;
  allowRemote: boolean;
  confirmation?: string;
} {
  const direction = args.shift();
  if (direction !== 'apply' && direction !== 'rollback') {
    throw new Error('Usage: document-evidence-observability-index <apply|rollback>');
  }
  let allowRemote = false;
  let confirmation: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--allow-remote') allowRemote = true;
    else if (flag === '--confirm' && args.length > 0) confirmation = args.shift();
    else throw new Error('Document evidence migration received an unsupported argument');
  }
  return { direction, allowRemote, ...(confirmation ? { confirmation } : {}) };
}

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');
  const result = await runDocumentEvidenceObservabilityIndexMigration({
    databaseUrl,
    ...parsed,
  });
  process.stdout.write(`Document evidence observability index ${parsed.direction}: ${result}\n`);
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
