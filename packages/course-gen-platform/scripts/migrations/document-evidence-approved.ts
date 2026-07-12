import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

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
type HistoryRow = { version: string; name: string | null; statements: string[] | null };

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
      sha256: '6263e6dee506a0195a0f64f40501961e52b52e15de9711630b4304f8d5ea005c',
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

export interface DocumentEvidenceApprovedMigrationOptions extends RemoteGate {
  databaseUrl: string;
  direction: Direction;
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

async function requireSupabaseHistory(client: Client): Promise<void> {
  const relation = await client.query<{ relation: string | null }>(
    `SELECT to_regclass('supabase_migrations.schema_migrations')::text AS relation`
  );
  if (relation.rows[0]?.relation !== 'supabase_migrations.schema_migrations') {
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
  const result = await client.query<{ relation: string | null }>(
    `SELECT to_regclass($1)::text AS relation`,
    [relation]
  );
  return result.rows[0]?.relation === relation.replace(/^public\./u, '');
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
    return;
  }
  if (!(await columnExists(client, 'document_evidence_decisions', 'selected_side_handle'))) {
    throw new Error(`Live document evidence side identity does not match migration ${version}`);
  }
  await assertProcedures(client, ['document_evidence_conflict_side_handle(uuid,jsonb)'], version);
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

export async function runDocumentEvidenceApprovedMigrations(
  options: DocumentEvidenceApprovedMigrationOptions
): Promise<MigrationResult> {
  validateDocumentEvidenceApprovedMigrationTarget(options.databaseUrl, options.direction, options);
  const migrations = await loadDocumentEvidenceApprovedMigrations();
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await requireSupabaseHistory(client);
    await client.query('SELECT pg_advisory_lock($1::bigint)', ['20260711120000']);
    try {
      await assertApprovedHistoryTopology(client, migrations);
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
    else throw new Error('Approved document evidence migration received an unsupported argument');
  }
  return { direction: action, allowRemote, ...(confirmation ? { confirmation } : {}) };
}

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');
  const result = await runDocumentEvidenceApprovedMigrations({ databaseUrl, ...parsed });
  process.stdout.write(`Approved document evidence migration ${parsed.direction}: ${result}\n`);
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
