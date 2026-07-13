import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDispositionEntry,
  createQ12CapabilityFetch,
  createRecoveryDispositionDatabase,
  createSupabaseRecoveryGateway,
  requireQ12CapabilityFetchInstalled,
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
const Q12_CAPABILITY = 'q12-capability-sentinel';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function capabilityFixture(mode = 0o400): string {
  const directory = mkdtempSync('/tmp/q12-db-capability-');
  temporaryDirectories.push(directory);
  const capabilityPath = join(directory, 'q12_db_capability');
  writeFileSync(capabilityPath, `${Q12_CAPABILITY}\n`, { mode });
  chmodSync(capabilityPath, mode);
  return capabilityPath;
}

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

describe('Q12 Supabase REST capability binding', () => {
  it('consumes the staged file once and adds the capability only to the exact REST origin', async () => {
    const capabilityPath = capabilityFixture();
    const calls: Array<{ url: string; headers: Headers }> = [];
    const underlyingFetch: typeof fetch = (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push({ url: request.url, headers: request.headers });
      return Promise.resolve(new Response(null, { status: 204 }));
    };

    const capabilityFetch = createQ12CapabilityFetch({
      environment: {
        SUPABASE_URL: 'https://db.example.test',
        Q12_DB_CAPABILITY_BOUND: '1',
        Q12_DB_CAPABILITY_FILE: capabilityPath,
      },
      expectedPath: capabilityPath,
      expectedUid: process.getuid?.(),
      expectedGid: process.getgid?.(),
      expectedSupabaseOrigin: 'https://db.example.test',
      fetch: underlyingFetch,
    });

    expect(existsSync(capabilityPath)).toBe(false);
    await capabilityFetch('https://db.example.test/rest/v1/file_catalog?id=eq.1');
    await capabilityFetch('https://db.example.test/auth/v1/user');
    await capabilityFetch('https://db.example.test/storage/v1/object');
    await capabilityFetch('https://qdrant.example.test/collections');
    await capabilityFetch('https://db.example.test.evil/rest/v1/file_catalog');

    expect(calls[0]?.headers.get('x-q12-capability')).toBe(Q12_CAPABILITY);
    expect(calls.slice(1).every(call => !call.headers.has('x-q12-capability'))).toBe(true);
  });

  it('rejects a malicious configured origin before consuming the capability', () => {
    const capabilityPath = capabilityFixture();
    expect(() =>
      createQ12CapabilityFetch({
        environment: {
          SUPABASE_URL: 'https://attacker.example/rest/v1',
          Q12_DB_CAPABILITY_BOUND: '1',
          Q12_DB_CAPABILITY_FILE: capabilityPath,
        },
        expectedPath: capabilityPath,
        expectedUid: process.getuid?.(),
        expectedGid: process.getgid?.(),
        fetch,
      })
    ).toThrow(/capability binding rejected/iu);
    expect(existsSync(capabilityPath)).toBe(true);
  });

  it('fails cross-origin REST redirects without forwarding the capability to a second request', async () => {
    const capabilityPath = capabilityFixture();
    const calls: Request[] = [];
    const redirectingFetch: typeof fetch = (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request);
      if (request.redirect !== 'error') {
        calls.push(
          new Request('https://attacker.example/collect', {
            headers: request.headers,
          })
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'https://attacker.example/collect' },
        })
      );
    };
    const capabilityFetch = createQ12CapabilityFetch({
      environment: {
        SUPABASE_URL: 'https://db.example.test',
        Q12_DB_CAPABILITY_BOUND: '1',
        Q12_DB_CAPABILITY_FILE: capabilityPath,
      },
      expectedPath: capabilityPath,
      expectedUid: process.getuid?.(),
      expectedGid: process.getgid?.(),
      expectedSupabaseOrigin: 'https://db.example.test',
      fetch: redirectingFetch,
    });

    await capabilityFetch('https://db.example.test/rest/v1/file_catalog');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.redirect).toBe('error');
    expect(calls[0]?.headers.get('x-q12-capability')).toBe(Q12_CAPABILITY);
    expect(calls.some(call => call.url.startsWith('https://attacker.example/'))).toBe(false);
  });

  it('leaves ordinary fetches unchanged and does not consume an unbound path', async () => {
    const capabilityPath = capabilityFixture();
    const calls: Headers[] = [];
    const underlyingFetch: typeof fetch = (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request.headers);
      return Promise.resolve(new Response(null, { status: 204 }));
    };

    const ordinaryFetch = createQ12CapabilityFetch({
      environment: { SUPABASE_URL: 'https://db.example.test' },
      expectedPath: capabilityPath,
      expectedUid: process.getuid?.(),
      expectedGid: process.getgid?.(),
      fetch: underlyingFetch,
    });
    await ordinaryFetch('https://db.example.test/rest/v1/file_catalog');

    expect(calls[0]?.has('x-q12-capability')).toBe(false);
    expect(existsSync(capabilityPath)).toBe(true);
  });

  it('rejects permissive or symlinked capability files without exposing their contents', () => {
    const assertRejected = (capabilityPath: string): void => {
      let thrown: unknown;
      try {
        createQ12CapabilityFetch({
          environment: {
            SUPABASE_URL: 'https://db.example.test',
            Q12_DB_CAPABILITY_BOUND: '1',
            Q12_DB_CAPABILITY_FILE: capabilityPath,
          },
          expectedPath: capabilityPath,
          expectedUid: process.getuid?.(),
          expectedGid: process.getgid?.(),
          expectedSupabaseOrigin: 'https://db.example.test',
          fetch: fetch,
        });
      } catch (error) {
        thrown = error;
      }
      expect(String(thrown)).toMatch(/capability binding rejected/iu);
      expect(String(thrown)).not.toContain(Q12_CAPABILITY);
    };

    assertRejected(capabilityFixture(0o440));

    const target = capabilityFixture();
    const link = `${target}.link`;
    symlinkSync(target, link);
    assertRejected(link);
  });

  it('fails closed when a Q12 default dependency is created before the binding is installed', () => {
    expect(() =>
      requireQ12CapabilityFetchInstalled(
        {
          Q12_DB_CAPABILITY_BOUND: '1',
          Q12_DB_CAPABILITY_FILE: '/run/qdrant-operator/q12_db_capability',
        },
        false
      )
    ).toThrow(/capability binding rejected/iu);
    expect(() => requireQ12CapabilityFetchInstalled({}, false)).not.toThrow();
  });
});
