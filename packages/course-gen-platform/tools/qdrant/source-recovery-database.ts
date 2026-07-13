import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

import type { RecoveryDispositionEntry } from './source-recovery-manifest.js';

const Q12_STAGED_CAPABILITY_PATH = '/run/qdrant-operator/q12_db_capability';
const Q12_SUPABASE_ORIGIN = 'https://diqooqbuchsliypgwksu.supabase.co';
const Q12_CAPABILITY_HEADER = 'x-q12-capability';
const Q12_CAPABILITY_MAX_BYTES = 512;
const Q12_CAPABILITY_REJECTED = 'Q12 database capability binding rejected';

interface Q12CapabilityEnvironment {
  SUPABASE_URL?: string;
  Q12_DB_CAPABILITY_BOUND?: string;
  Q12_DB_CAPABILITY_FILE?: string;
}

export interface Q12CapabilityFetchOptions {
  environment: Q12CapabilityEnvironment;
  fetch: typeof fetch;
  expectedPath?: string;
  expectedUid?: number;
  expectedGid?: number;
  /** Test-only origin seam; production installation never supplies this. */
  expectedSupabaseOrigin?: string;
}

function rejectCapabilityBinding(): never {
  throw new Error(Q12_CAPABILITY_REJECTED);
}

function readAndConsumeCapability(
  capabilityPath: string,
  expectedUid: number | undefined,
  expectedGid: number | undefined
): string {
  let fd: number | undefined;
  let parentFd: number | undefined;
  try {
    const parent = dirname(capabilityPath);
    const parentStat = lstatSync(parent);
    if (
      !parentStat.isDirectory() ||
      parentStat.isSymbolicLink() ||
      (parentStat.mode & 0o077) !== 0 ||
      (expectedUid !== undefined && parentStat.uid !== expectedUid) ||
      (expectedGid !== undefined && parentStat.gid !== expectedGid)
    ) {
      rejectCapabilityBinding();
    }

    const pathStat = lstatSync(capabilityPath);
    if (
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      (pathStat.mode & 0o777) !== 0o400 ||
      pathStat.size < 2 ||
      pathStat.size > Q12_CAPABILITY_MAX_BYTES ||
      (expectedUid !== undefined && pathStat.uid !== expectedUid) ||
      (expectedGid !== undefined && pathStat.gid !== expectedGid) ||
      realpathSync(capabilityPath) !== capabilityPath
    ) {
      rejectCapabilityBinding();
    }

    fd = openSync(capabilityPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (before.dev !== pathStat.dev || before.ino !== pathStat.ino) {
      rejectCapabilityBinding();
    }
    const raw = readFileSync(fd, { encoding: 'utf8' });
    const after = fstatSync(fd);
    const current = lstatSync(capabilityPath);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      current.dev !== before.dev ||
      current.ino !== before.ino
    ) {
      rejectCapabilityBinding();
    }
    const capability = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    if (
      capability.length === 0 ||
      capability.includes('\n') ||
      capability.includes('\r') ||
      capability.trim() !== capability
    ) {
      rejectCapabilityBinding();
    }

    unlinkSync(capabilityPath);
    parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY);
    fsyncSync(parentFd);
    return capability;
  } catch (error) {
    if (error instanceof Error && error.message === Q12_CAPABILITY_REJECTED) throw error;
    rejectCapabilityBinding();
  } finally {
    if (parentFd !== undefined) closeSync(parentFd);
    if (fd !== undefined) closeSync(fd);
  }
}

function exactRestPrefix(
  supabaseUrl: string,
  expectedOrigin = Q12_SUPABASE_ORIGIN
): { origin: string; prefix: string } {
  let base: URL;
  let expected: URL;
  try {
    base = new URL(supabaseUrl);
    expected = new URL(expectedOrigin);
  } catch {
    rejectCapabilityBinding();
  }
  if (
    !['http:', 'https:'].includes(expected.protocol) ||
    expected.username !== '' ||
    expected.password !== '' ||
    expected.pathname !== '/' ||
    expected.search !== '' ||
    expected.hash !== '' ||
    expected.origin !== expectedOrigin ||
    base.origin !== expected.origin ||
    base.username !== '' ||
    base.password !== '' ||
    base.pathname !== '/' ||
    base.search !== '' ||
    base.hash !== ''
  ) {
    rejectCapabilityBinding();
  }
  return { origin: expected.origin, prefix: '/rest/v1' };
}

/**
 * Consumes the tmpfs-staged Q12 capability once and keeps it in this closure only.
 * The wrapper attaches it solely to the exact configured Supabase REST origin/path.
 */
export function createQ12CapabilityFetch(options: Q12CapabilityFetchOptions): typeof fetch {
  const { environment } = options;
  const marker = environment.Q12_DB_CAPABILITY_BOUND;
  const configuredPath = environment.Q12_DB_CAPABILITY_FILE;
  if (marker === undefined && configuredPath === undefined) return options.fetch;
  if (marker !== '1' || configuredPath === undefined) rejectCapabilityBinding();

  const expectedPath = options.expectedPath ?? Q12_STAGED_CAPABILITY_PATH;
  if (configuredPath !== expectedPath) rejectCapabilityBinding();
  const supabaseUrl = environment.SUPABASE_URL;
  if (!supabaseUrl) rejectCapabilityBinding();
  const target = exactRestPrefix(supabaseUrl, options.expectedSupabaseOrigin);
  const capability = readAndConsumeCapability(
    configuredPath,
    options.expectedUid,
    options.expectedGid
  );

  return async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    const requestedUrl = new URL(request.url);
    const isSupabaseRest =
      requestedUrl.origin === target.origin &&
      (requestedUrl.pathname === target.prefix ||
        requestedUrl.pathname.startsWith(`${target.prefix}/`));
    if (!isSupabaseRest) return options.fetch(request);
    const headers = new Headers(request.headers);
    headers.set(Q12_CAPABILITY_HEADER, capability);
    return options.fetch(new Request(request, { headers, redirect: 'error' }));
  };
}

let q12CapabilityFetchInstalled = false;

export function installQ12CapabilityFetch(): boolean {
  if (q12CapabilityFetchInstalled) return true;
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') {
    if (
      process.env.Q12_DB_CAPABILITY_BOUND === undefined &&
      process.env.Q12_DB_CAPABILITY_FILE === undefined
    ) {
      return false;
    }
    rejectCapabilityBinding();
  }
  const wrapped = createQ12CapabilityFetch({
    environment: process.env,
    fetch: originalFetch,
    expectedUid: process.getuid?.(),
    expectedGid: process.getgid?.(),
  });
  if (wrapped === originalFetch) return false;
  globalThis.fetch = wrapped;
  q12CapabilityFetchInstalled = true;
  return true;
}

export function isQ12CapabilityFetchInstalled(): boolean {
  return q12CapabilityFetchInstalled;
}

export function requireQ12CapabilityFetchInstalled(
  environment: Q12CapabilityEnvironment = process.env,
  installed = q12CapabilityFetchInstalled
): void {
  const requested =
    environment.Q12_DB_CAPABILITY_BOUND !== undefined ||
    environment.Q12_DB_CAPABILITY_FILE !== undefined;
  if (
    requested &&
    (environment.Q12_DB_CAPABILITY_BOUND !== '1' ||
      environment.Q12_DB_CAPABILITY_FILE !== Q12_STAGED_CAPABILITY_PATH ||
      !installed)
  ) {
    rejectCapabilityBinding();
  }
}

// This module is imported before either recovery command constructs its Supabase client.
installQ12CapabilityFetch();

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
