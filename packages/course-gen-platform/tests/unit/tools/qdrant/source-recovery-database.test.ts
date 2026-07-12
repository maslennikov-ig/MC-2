import { describe, expect, it } from 'vitest';
import {
  applyDispositionEntry,
  createRecoveryDispositionDatabase,
  createSupabaseRecoveryGateway,
  type RecoveryCatalogRow,
  type RecoveryDatabaseGateway,
  type RecoveryPlaybookRow,
  type RecoverySupabaseClient,
} from '../../../../tools/qdrant/source-recovery-database.js';
import type { RecoveryDispositionEntry } from '../../../../tools/qdrant/source-recovery-manifest.js';

const FILE_ID = '2e31f684-67a8-48b5-9c49-cc385fc04b37';
const SOURCE_ID = '96b5a9fb-fb09-4bd7-b3de-fd70319d5dc8';
const ORGANIZATION_ID = 'caacdf41-6267-471b-9331-02a45611a8a7';
const COURSE_ID = '5191a3cc-d417-4451-9bc6-240ac38e469c';
const PLAYBOOK_ID = 'e49be5a4-519f-4ef7-9315-f9596ff911cf';
const USER_ID = 'f303c89a-1567-4797-bd28-66bcd4b76425';

const catalogRow = (overrides: Partial<RecoveryCatalogRow> = {}): RecoveryCatalogRow => ({
  id: FILE_ID,
  organization_id: ORGANIZATION_ID,
  course_id: COURSE_ID,
  storage_path: 'uploads/org/course/original.pdf',
  hash: 'a'.repeat(64),
  vector_status: 'indexed',
  error_message: null,
  ...overrides,
});

const playbookRow = (overrides: Partial<RecoveryPlaybookRow> = {}): RecoveryPlaybookRow => ({
  id: SOURCE_ID,
  playbook_id: PLAYBOOK_ID,
  organization_id: ORGANIZATION_ID,
  user_id: USER_ID,
  file_catalog_id: FILE_ID,
  status: 'ready',
  error_message: null,
  ...overrides,
});

function gateway(overrides: Partial<RecoveryDatabaseGateway> = {}): RecoveryDatabaseGateway {
  return {
    selectFileCatalog: () => Promise.resolve([]),
    selectCareerPlaybookSources: () => Promise.resolve([]),
    updateFileCatalog: () => Promise.resolve([]),
    updateCareerPlaybookSource: () => Promise.resolve([]),
    ...overrides,
  };
}

describe('source recovery disposition database', () => {
  it('builds PATCH with exact nullable predicates before requesting returned rows', async () => {
    const calls: string[] = [];
    const query = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      update(patch: Record<string, unknown>) {
        calls.push(`update:${JSON.stringify(patch)}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      is(column: string, value: null) {
        calls.push(`is:${column}:${String(value)}`);
        return this;
      },
      in() {
        return this;
      },
      gt() {
        return this;
      },
      order() {
        return this;
      },
      limit(value: number) {
        calls.push(`limit:${value}`);
        return this;
      },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: [catalogRow({ course_id: null })], error: null }));
      },
    };
    const client = {
      from(table: 'file_catalog' | 'career_playbook_sources') {
        calls.push(`from:${table}`);
        return query;
      },
    } as RecoverySupabaseClient;
    const gateway = createSupabaseRecoveryGateway(client);

    await gateway.updateFileCatalog({
      expected: catalogRow({ course_id: null }),
      patch: {
        vector_status: 'failed',
        error_message: 'source_file_unrecoverable; recovery_run=run-1',
      },
    });

    expect(calls.indexOf(`eq:id:${FILE_ID}`)).toBeLessThan(
      calls.findIndex(call => call.startsWith('select:'))
    );
    expect(calls).toContain('is:course_id:null');
    expect(calls).toContain('is:error_message:null');
    expect(calls).toContain(`eq:organization_id:${ORGANIZATION_ID}`);
    expect(calls).toContain(`eq:storage_path:${catalogRow().storage_path}`);
    expect(calls).toContain(`eq:hash:${'a'.repeat(64)}`);
    expect(calls).toContain('eq:vector_status:indexed');
  });

  it('reads reviewed identities in bounded, increasing batches and rejects duplicate rows', async () => {
    const calls: Array<{ ids: readonly string[]; afterId?: string; limit: number }> = [];
    const ids = Array.from(
      { length: 205 },
      (_, index) => `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
    );
    const rows = ids.map(id => catalogRow({ id }));
    const database = createRecoveryDispositionDatabase(
      gateway({
        selectFileCatalog: input => {
          calls.push(input);
          return Promise.resolve(
            rows.filter(row => input.ids.includes(row.id)).slice(0, input.limit)
          );
        },
      }),
      { readBatchSize: 100 }
    );

    await expect(database.listFileCatalogExpectedRows(ids)).resolves.toEqual(rows);
    expect(calls.map(call => call.ids.length)).toEqual([100, 100, 5]);
    expect(calls.every(call => call.limit === 100)).toBe(true);
    expect(calls.map(call => call.afterId)).toEqual([undefined, undefined, undefined]);

    const duplicateDatabase = createRecoveryDispositionDatabase(
      gateway({ selectFileCatalog: () => Promise.resolve([catalogRow(), catalogRow()]) })
    );
    await expect(duplicateDatabase.listFileCatalogExpectedRows([FILE_ID])).rejects.toThrow(
      /duplicate file_catalog/iu
    );

    const duplicatePlaybookDatabase = createRecoveryDispositionDatabase(
      gateway({
        selectCareerPlaybookSources: () =>
          Promise.resolve([
            playbookRow(),
            playbookRow({ id: 'a6b5a9fb-fb09-4bd7-b3de-fd70319d5dc8' }),
          ]),
      })
    );
    await expect(
      duplicatePlaybookDatabase.listCareerPlaybookExpectedRows([FILE_ID])
    ).rejects.toThrow(/duplicate career_playbook_sources file_catalog/iu);
  });

  it('uses every reviewed file predicate and reconciles only the exact applied state', async () => {
    const updates: Parameters<RecoveryDatabaseGateway['updateFileCatalog']>[0][] = [];
    const selects: Parameters<RecoveryDatabaseGateway['selectFileCatalog']>[0][] = [];
    const expected = catalogRow();
    const nextErrorMessage = 'source_file_unrecoverable; recovery_run=run-1';
    const database = createRecoveryDispositionDatabase(
      gateway({
        updateFileCatalog: input => {
          updates.push(input);
          return Promise.resolve([]);
        },
        selectFileCatalog: input => {
          selects.push(input);
          return Promise.resolve([
            catalogRow({ vector_status: 'failed', error_message: nextErrorMessage }),
          ]);
        },
      })
    );

    await expect(
      database.casFileCatalog({ expected, nextStatus: 'failed', nextErrorMessage })
    ).resolves.toBe(1);
    expect(updates).toEqual([
      {
        expected,
        patch: { vector_status: 'failed', error_message: nextErrorMessage },
      },
    ]);
    expect(selects).toEqual([
      {
        ids: [FILE_ID],
        limit: 1,
        applied: {
          id: FILE_ID,
          organization_id: ORGANIZATION_ID,
          course_id: COURSE_ID,
          storage_path: expected.storage_path,
          hash: expected.hash,
          vector_status: 'failed',
          error_message: nextErrorMessage,
        },
      },
    ]);
  });

  it('returns zero on CAS drift and never mutates an unrelated tenant row', async () => {
    const expected = catalogRow();
    const unrelated = catalogRow({
      id: '9e31f684-67a8-48b5-9c49-cc385fc04b37',
      organization_id: 'daacdf41-6267-471b-9331-02a45611a8a7',
    });
    const stored = [expected, unrelated];
    const database = createRecoveryDispositionDatabase(
      gateway({
        updateFileCatalog: input => {
          const index = stored.findIndex(row =>
            Object.entries(input.expected).every(
              ([key, value]) => row[key as keyof RecoveryCatalogRow] === value
            )
          );
          if (index < 0) return Promise.resolve([]);
          stored[index] = { ...stored[index], ...input.patch };
          return Promise.resolve([stored[index]]);
        },
        selectFileCatalog: input =>
          Promise.resolve(
            stored.filter(row =>
              input.applied
                ? Object.entries(input.applied).every(
                    ([key, value]) => row[key as keyof RecoveryCatalogRow] === value
                  )
                : input.ids.includes(row.id)
            )
          ),
      })
    );

    await expect(
      database.casFileCatalog({
        expected: { ...expected, hash: 'b'.repeat(64) },
        nextStatus: 'failed',
        nextErrorMessage: 'source_file_unrecoverable; recovery_run=run-1',
      })
    ).resolves.toBe(0);
    expect(stored).toEqual([expected, unrelated]);
  });

  it('rejects a one-row PATCH response unless it is the exact requested outcome', async () => {
    const expected = catalogRow();
    const database = createRecoveryDispositionDatabase(
      gateway({
        updateFileCatalog: () =>
          Promise.resolve([
            catalogRow({
              id: '9e31f684-67a8-48b5-9c49-cc385fc04b37',
              vector_status: 'failed',
              error_message: 'source_file_unrecoverable; recovery_run=run-1',
            }),
          ]),
      })
    );

    await expect(
      database.casFileCatalog({
        expected,
        nextStatus: 'failed',
        nextErrorMessage: 'source_file_unrecoverable; recovery_run=run-1',
      })
    ).rejects.toThrow(/returned row.*exact applied state/iu);
  });

  it('requires the Career Playbook source CAS checkpoint before the catalog CAS', async () => {
    const events: string[] = [];
    const expectedFile = catalogRow({ course_id: null });
    const expectedSource = playbookRow();
    const disposition: RecoveryDispositionEntry = {
      entry_id: 'disposition-career',
      kind: 'career_playbook_retained_derived',
      file_catalog_id: FILE_ID,
      career_playbook_source_id: SOURCE_ID,
      organization_id: ORGANIZATION_ID,
      course_id: null,
      expected_hash: expectedFile.hash,
      expected_storage_path: expectedFile.storage_path,
      expected_vector_status: expectedFile.vector_status,
      expected_file_error_message: null,
      expected_career_playbook: {
        playbook_id: PLAYBOOK_ID,
        user_id: USER_ID,
        status: 'ready',
        error_message: null,
      },
      reason: 'retained-derived-only',
    };
    const database = createRecoveryDispositionDatabase(
      gateway({
        updateCareerPlaybookSource: input => {
          expect(input.expected).toEqual(expectedSource);
          events.push('source-cas');
          return Promise.resolve([{ ...expectedSource, ...input.patch }]);
        },
        updateFileCatalog: input => {
          expect(input.expected).toEqual(expectedFile);
          events.push('catalog-cas');
          return Promise.resolve([{ ...expectedFile, ...input.patch }]);
        },
      })
    );

    const afterSource = await applyDispositionEntry({
      database,
      entry: disposition,
      runId: 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e',
      state: 'disposition_planned',
      persistCheckpoint: state => {
        events.push(`checkpoint:${state}`);
        return Promise.resolve();
      },
      stopAfterCheckpoint: 'career_playbook_source_applied',
    });
    expect(afterSource).toBe('career_playbook_source_applied');
    expect(events).toEqual(['source-cas', 'checkpoint:career_playbook_source_applied']);

    const afterCatalog = await applyDispositionEntry({
      database,
      entry: disposition,
      runId: 'ea25d26d-9dc3-4c2c-9e42-95ab8270cb6e',
      state: afterSource,
      persistCheckpoint: state => {
        events.push(`checkpoint:${state}`);
        return Promise.resolve();
      },
    });
    expect(afterCatalog).toBe('disposition_applied');
    expect(events).toEqual([
      'source-cas',
      'checkpoint:career_playbook_source_applied',
      'catalog-cas',
      'checkpoint:disposition_applied',
    ]);
  });
});
