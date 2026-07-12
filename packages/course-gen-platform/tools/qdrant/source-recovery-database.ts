import type { RecoveryDispositionEntry } from './source-recovery-manifest.js';

export type RecoveryVectorStatus = 'pending' | 'indexing' | 'indexed' | 'failed';
export type RecoveryPlaybookStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'removed';

export interface RecoveryCatalogRow {
  id: string;
  organization_id: string;
  course_id: string | null;
  storage_path: string;
  hash: string;
  vector_status: RecoveryVectorStatus;
  error_message: string | null;
}

export interface RecoveryPlaybookRow {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  file_catalog_id: string;
  status: RecoveryPlaybookStatus;
  error_message: string | null;
}

export interface FileDispositionCas {
  expected: RecoveryCatalogRow;
  nextStatus: 'failed';
  nextErrorMessage: string;
}

export interface PlaybookDispositionCas {
  expected: RecoveryPlaybookRow;
  nextStatus: 'failed';
  nextErrorMessage: string;
}

export interface RecoveryDispositionDatabase {
  listFileCatalogExpectedRows(ids: readonly string[]): Promise<RecoveryCatalogRow[]>;
  listCareerPlaybookExpectedRows(fileCatalogIds: readonly string[]): Promise<RecoveryPlaybookRow[]>;
  casFileCatalog(input: FileDispositionCas): Promise<0 | 1>;
  casCareerPlaybookSource(input: PlaybookDispositionCas): Promise<0 | 1>;
}

export interface RecoveryFileSelect {
  ids: readonly string[];
  afterId?: string;
  limit: number;
  applied?: RecoveryCatalogRow;
}

export interface RecoveryPlaybookSelect {
  fileCatalogIds: readonly string[];
  afterId?: string;
  limit: number;
  applied?: RecoveryPlaybookRow;
}

export interface RecoveryDatabaseGateway {
  selectFileCatalog(input: RecoveryFileSelect): Promise<RecoveryCatalogRow[]>;
  selectCareerPlaybookSources(input: RecoveryPlaybookSelect): Promise<RecoveryPlaybookRow[]>;
  updateFileCatalog(input: {
    expected: RecoveryCatalogRow;
    patch: Pick<RecoveryCatalogRow, 'vector_status' | 'error_message'>;
  }): Promise<RecoveryCatalogRow[]>;
  updateCareerPlaybookSource(input: {
    expected: RecoveryPlaybookRow;
    patch: Pick<RecoveryPlaybookRow, 'status' | 'error_message'>;
  }): Promise<RecoveryPlaybookRow[]>;
}

const FILE_COLUMNS =
  'id, organization_id, course_id, storage_path, hash, vector_status, error_message';
const PLAYBOOK_COLUMNS =
  'id, playbook_id, organization_id, user_id, file_catalog_id, status, error_message';
const DEFAULT_READ_BATCH_SIZE = 100;
const MAX_READ_BATCH_SIZE = 200;

interface RecoveryQueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface RecoveryQuery extends PromiseLike<RecoveryQueryResult> {
  select(columns: string): RecoveryQuery;
  update(patch: Record<string, unknown>): RecoveryQuery;
  eq(column: string, value: string): RecoveryQuery;
  is(column: string, value: null): RecoveryQuery;
  in(column: string, values: readonly string[]): RecoveryQuery;
  gt(column: string, value: string): RecoveryQuery;
  order(column: string): RecoveryQuery;
  limit(value: number): RecoveryQuery;
}

export interface RecoverySupabaseClient {
  from(table: 'file_catalog' | 'career_playbook_sources'): RecoveryQuery;
}

function throwOnQueryError(label: string, result: RecoveryQueryResult): unknown[] {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function applyNullablePredicate(query: RecoveryQuery, column: string, value: string | null): void {
  if (value === null) query.is(column, null);
  else query.eq(column, value);
}

function applyFilePredicates(query: RecoveryQuery, row: RecoveryCatalogRow): void {
  query.eq('id', row.id);
  query.eq('organization_id', row.organization_id);
  applyNullablePredicate(query, 'course_id', row.course_id);
  query.eq('storage_path', row.storage_path);
  query.eq('hash', row.hash);
  query.eq('vector_status', row.vector_status);
  applyNullablePredicate(query, 'error_message', row.error_message);
}

function applyPlaybookPredicates(query: RecoveryQuery, row: RecoveryPlaybookRow): void {
  query.eq('id', row.id);
  query.eq('playbook_id', row.playbook_id);
  query.eq('organization_id', row.organization_id);
  query.eq('user_id', row.user_id);
  query.eq('file_catalog_id', row.file_catalog_id);
  query.eq('status', row.status);
  applyNullablePredicate(query, 'error_message', row.error_message);
}

export function createSupabaseRecoveryGateway(
  client: RecoverySupabaseClient
): RecoveryDatabaseGateway {
  return {
    async selectFileCatalog(input) {
      let query = client.from('file_catalog').select(FILE_COLUMNS).in('id', input.ids);
      if (input.afterId) query = query.gt('id', input.afterId);
      if (input.applied) applyFilePredicates(query, input.applied);
      const result = await query.order('id').limit(input.limit);
      return throwOnQueryError(
        'Unable to read reviewed file_catalog rows',
        result
      ) as RecoveryCatalogRow[];
    },
    async selectCareerPlaybookSources(input) {
      let query = client
        .from('career_playbook_sources')
        .select(PLAYBOOK_COLUMNS)
        .in('file_catalog_id', input.fileCatalogIds);
      if (input.afterId) query = query.gt('id', input.afterId);
      if (input.applied) applyPlaybookPredicates(query, input.applied);
      const result = await query.order('id').limit(input.limit);
      return throwOnQueryError(
        'Unable to read reviewed career_playbook_sources rows',
        result
      ) as RecoveryPlaybookRow[];
    },
    async updateFileCatalog(input) {
      const query = client.from('file_catalog').update(input.patch);
      applyFilePredicates(query, input.expected);
      const result = await query.select(FILE_COLUMNS).limit(2);
      return throwOnQueryError(
        'Unable to apply file_catalog disposition CAS',
        result
      ) as RecoveryCatalogRow[];
    },
    async updateCareerPlaybookSource(input) {
      const query = client.from('career_playbook_sources').update(input.patch);
      applyPlaybookPredicates(query, input.expected);
      const result = await query.select(PLAYBOOK_COLUMNS).limit(2);
      return throwOnQueryError(
        'Unable to apply career_playbook_sources disposition CAS',
        result
      ) as RecoveryPlaybookRow[];
    },
  };
}

function assertUniqueRows<T extends { id: string }>(rows: readonly T[], label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`Duplicate ${label} row: ${row.id}`);
    seen.add(row.id);
  }
}

function assertUniqueField<T>(rows: readonly T[], field: keyof T, label: string): void {
  const seen = new Set<unknown>();
  for (const row of rows) {
    const value = row[field];
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${String(value)}`);
    seen.add(value);
  }
}

function assertAtMostOne(rows: readonly unknown[], label: string): 0 | 1 {
  if (rows.length > 1) throw new Error(`${label} affected more than one row`);
  return rows.length as 0 | 1;
}

function assertExactReturnedRow<T extends Record<string, unknown>>(
  rows: readonly T[],
  expected: T,
  label: string
): 0 | 1 {
  const affected = assertAtMostOne(rows, label);
  if (affected === 1 && !Object.entries(expected).every(([key, value]) => rows[0][key] === value)) {
    throw new Error(`${label} returned row is not the exact applied state`);
  }
  return affected;
}

function uniqueSorted(values: readonly string[], label: string): string[] {
  const sorted = [...values].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1])
      throw new Error(`Duplicate ${label}: ${sorted[index]}`);
  }
  return sorted;
}

export function createRecoveryDispositionDatabase(
  gateway: RecoveryDatabaseGateway,
  options: { readBatchSize?: number } = {}
): RecoveryDispositionDatabase {
  const readBatchSize = options.readBatchSize ?? DEFAULT_READ_BATCH_SIZE;
  if (
    !Number.isInteger(readBatchSize) ||
    readBatchSize < 1 ||
    readBatchSize > MAX_READ_BATCH_SIZE
  ) {
    throw new Error(`Recovery read batch size must be between 1 and ${MAX_READ_BATCH_SIZE}`);
  }

  return {
    async listFileCatalogExpectedRows(ids) {
      const sortedIds = uniqueSorted(ids, 'file_catalog id');
      const rows: RecoveryCatalogRow[] = [];
      for (let index = 0; index < sortedIds.length; index += readBatchSize) {
        rows.push(
          ...(await gateway.selectFileCatalog({
            ids: sortedIds.slice(index, index + readBatchSize),
            limit: readBatchSize,
          }))
        );
      }
      rows.sort((left, right) => left.id.localeCompare(right.id));
      assertUniqueRows(rows, 'file_catalog');
      return rows;
    },
    async listCareerPlaybookExpectedRows(fileCatalogIds) {
      const sortedIds = uniqueSorted(fileCatalogIds, 'career playbook file_catalog id');
      const rows: RecoveryPlaybookRow[] = [];
      for (let index = 0; index < sortedIds.length; index += readBatchSize) {
        rows.push(
          ...(await gateway.selectCareerPlaybookSources({
            fileCatalogIds: sortedIds.slice(index, index + readBatchSize),
            limit: readBatchSize,
          }))
        );
      }
      rows.sort((left, right) => left.id.localeCompare(right.id));
      assertUniqueRows(rows, 'career_playbook_sources');
      assertUniqueField(rows, 'file_catalog_id', 'career_playbook_sources file_catalog identity');
      return rows;
    },
    async casFileCatalog(input) {
      const patch = {
        vector_status: input.nextStatus,
        error_message: input.nextErrorMessage,
      } as const;
      const updated = await gateway.updateFileCatalog({ expected: input.expected, patch });
      const applied: RecoveryCatalogRow = { ...input.expected, ...patch };
      const affected = assertExactReturnedRow(updated, applied, 'file_catalog disposition CAS');
      if (affected === 1) return 1;

      const reconciled = await gateway.selectFileCatalog({
        ids: [input.expected.id],
        limit: 1,
        applied,
      });
      return assertExactReturnedRow(
        reconciled,
        applied,
        'file_catalog applied-state reconciliation'
      );
    },
    async casCareerPlaybookSource(input) {
      const patch = { status: input.nextStatus, error_message: input.nextErrorMessage } as const;
      const updated = await gateway.updateCareerPlaybookSource({ expected: input.expected, patch });
      const applied: RecoveryPlaybookRow = { ...input.expected, ...patch };
      const affected = assertExactReturnedRow(
        updated,
        applied,
        'career_playbook_sources disposition CAS'
      );
      if (affected === 1) return 1;

      const reconciled = await gateway.selectCareerPlaybookSources({
        fileCatalogIds: [input.expected.file_catalog_id],
        limit: 1,
        applied,
      });
      return assertExactReturnedRow(
        reconciled,
        applied,
        'career_playbook_sources applied-state reconciliation'
      );
    },
  };
}

export type RecoveryDispositionProgressState =
  | 'disposition_planned'
  | 'career_playbook_source_applied'
  | 'disposition_applied'
  | 'disposition_verified';

function expectedFileRow(entry: RecoveryDispositionEntry): RecoveryCatalogRow {
  return {
    id: entry.file_catalog_id,
    organization_id: entry.organization_id,
    course_id: entry.course_id,
    storage_path: entry.expected_storage_path,
    hash: entry.expected_hash,
    vector_status: entry.expected_vector_status,
    error_message: entry.expected_file_error_message,
  };
}

function expectedPlaybookRow(entry: RecoveryDispositionEntry): RecoveryPlaybookRow {
  if (!entry.career_playbook_source_id || !entry.expected_career_playbook) {
    throw new Error('Career Playbook disposition is missing reviewed source predicates');
  }
  return {
    id: entry.career_playbook_source_id,
    playbook_id: entry.expected_career_playbook.playbook_id,
    organization_id: entry.organization_id,
    user_id: entry.expected_career_playbook.user_id,
    file_catalog_id: entry.file_catalog_id,
    status: entry.expected_career_playbook.status,
    error_message: entry.expected_career_playbook.error_message,
  };
}

export async function applyDispositionEntry(input: {
  database: RecoveryDispositionDatabase;
  entry: RecoveryDispositionEntry;
  runId: string;
  state: RecoveryDispositionProgressState;
  persistCheckpoint: (state: RecoveryDispositionProgressState) => Promise<void>;
  stopAfterCheckpoint?: RecoveryDispositionProgressState;
}): Promise<RecoveryDispositionProgressState> {
  const reason = `${input.entry.reason}; recovery_run=${input.runId}`;
  let state = input.state;
  if (state === 'disposition_verified') return state;

  if (input.entry.kind === 'career_playbook_retained_derived' && state === 'disposition_planned') {
    const affected = await input.database.casCareerPlaybookSource({
      expected: expectedPlaybookRow(input.entry),
      nextStatus: 'failed',
      nextErrorMessage: reason,
    });
    if (affected !== 1) throw new Error('Career Playbook source disposition CAS mismatch');
    state = 'career_playbook_source_applied';
    await input.persistCheckpoint(state);
    if (input.stopAfterCheckpoint === state) return state;
  }

  if (state === 'disposition_planned' || state === 'career_playbook_source_applied') {
    const affected = await input.database.casFileCatalog({
      expected: expectedFileRow(input.entry),
      nextStatus: 'failed',
      nextErrorMessage: reason,
    });
    if (affected !== 1) throw new Error('file_catalog disposition CAS mismatch');
    state = 'disposition_applied';
    await input.persistCheckpoint(state);
  }

  return state;
}
