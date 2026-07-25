import { describe, expect, it, vi } from 'vitest';

import {
  calculateAcceptedFailedCoverageFingerprint,
  coverageScopeKey,
  expectedCoverageErrorMessage,
  type AcceptedFailedCoverageBinding,
} from '../../../../tools/qdrant/reindex-plan';
import {
  createSourceRecoveryReindexAdapters,
  formatAcceptedCoverageAuthority,
  normalizeSourceRecoveryReindexAdapterConfig,
  parseAcceptedCoverageAuthority,
  type SourceRecoveryReindexAdapterConfig,
} from '../../../../tools/qdrant/source-recovery-reindex-adapters';
import type { RecoveryCatalogRow } from '../../../../tools/qdrant/source-recovery-database';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

const RECOVERY_RUN_ID = '51000000-0000-4000-8000-000000000005';
const FOREIGN_RUN_ID = '53000000-0000-4000-8000-000000000005';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_ORGANIZATION_ID = '11000000-0000-4000-8000-000000000001';
const COURSE_A_ID = '20000000-0000-4000-8000-000000000002';
const COURSE_B_ID = '22000000-0000-4000-8000-000000000002';
// Golden serialization pin for calculateAcceptedFailedCoverageFingerprint over the fixture
// manifest below (six eligible dispositions across two course scopes).
const GOLDEN_COVERAGE_FINGERPRINT =
  'a8229359104316e18daaf08d7bed274dc08dccdb9d4d4adaacaf375ce48e4e13';

function fileId(index: number): string {
  return `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function manifest(): SourceRecoveryManifest {
  return {
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: RECOVERY_RUN_ID,
    release_sha: 'b'.repeat(40),
    generated_at: '2026-07-12T12:00:00.000Z',
    operator_image_digest: `sha256:${'c'.repeat(64)}`,
    source_audit_version: 'unit-reviewed-v1',
    development_root: '/srv/megacampus/uploads-dev',
    production_root: '/srv/megacampus/uploads',
    pre_counts: {
      total: 6,
      eligible: 6,
      recoverable: 0,
      missing: 4,
      invalid: 2,
      unsupported: 0,
    },
    expected_post_counts: {
      total: 6,
      eligible: 6,
      recoverable: 0,
      missing: 4,
      invalid: 2,
      unsupported: 0,
    },
    copies: [],
    dispositions: Array.from({ length: 6 }, (_, index) => ({
      entry_id: `eligible-${index}`,
      kind: 'eligible_unrecoverable' as const,
      file_catalog_id: fileId(index),
      organization_id: ORGANIZATION_ID,
      course_id: index < 4 ? COURSE_A_ID : COURSE_B_ID,
      expected_hash: 'a'.repeat(64),
      expected_storage_path: `uploads/org/course/audited-${index}.pdf`,
      expected_vector_status: 'pending' as const,
      expected_file_error_message: null,
      reason: 'source_file_unrecoverable' as const,
    })),
  };
}

function journal(value: SourceRecoveryManifest, revision = 48): RecoveryProgressJournal {
  const manifestSha256 = calculateRecoveryManifestSha256(value);
  return {
    schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
    run_id: value.run_id,
    manifest_sha256: manifestSha256,
    revision,
    phase: revision === 48 ? 'verified' : 'reindex_started',
    copy_states: {},
    disposition_kinds: Object.fromEntries(
      value.dispositions.map(entry => [entry.entry_id, entry.kind])
    ),
    disposition_states: Object.fromEntries(
      value.dispositions.map(entry => [entry.entry_id, 'disposition_verified'])
    ),
  };
}

// The recovered post-state `applyDispositionEntry` leaves behind for an eligible disposition.
function appliedRow(
  value: SourceRecoveryManifest,
  index: number,
  patch: Partial<RecoveryCatalogRow> = {}
): RecoveryCatalogRow {
  const entry = value.dispositions[index];
  return {
    id: entry.file_catalog_id,
    organization_id: entry.organization_id,
    course_id: entry.course_id,
    storage_path: entry.expected_storage_path,
    hash: entry.expected_hash,
    vector_status: 'failed',
    error_message: expectedCoverageErrorMessage(value.run_id),
    ...patch,
  };
}

function catalogBinding(
  value: SourceRecoveryManifest,
  sha256: string
): AcceptedFailedCoverageBinding {
  const scopes = [COURSE_A_ID, COURSE_B_ID].map(courseId => ({
    organizationId: ORGANIZATION_ID,
    courseId,
    entries: value.dispositions
      .filter(entry => entry.course_id === courseId)
      .map(entry => ({
        fileCatalogId: entry.file_catalog_id,
        organizationId: entry.organization_id,
        courseId: entry.course_id!,
        storagePath: entry.expected_storage_path,
        hash: entry.expected_hash,
        vectorStatus: 'failed' as const,
        errorMessage: expectedCoverageErrorMessage(value.run_id),
      })),
  }));
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    source: 'file_catalog',
    recoveryRunId: value.run_id,
    recoveryManifestSha256: sha256,
    fingerprint: '',
    scopes,
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  return binding;
}

function config(value = manifest()): SourceRecoveryReindexAdapterConfig {
  const sha256 = calculateRecoveryManifestSha256(value);
  return {
    manifestPath: '/secure/recovery/manifest.json',
    journalPath: '/secure/recovery/journal.json',
    expectedRecoveryRunId: value.run_id,
    expectedRecoveryManifestSha256: sha256,
    expectedCoverageFingerprint: catalogBinding(value, sha256).fingerprint,
    acceptedCoverageAuthority: formatAcceptedCoverageAuthority(value.run_id),
  };
}

function repository(value = manifest(), rows?: RecoveryCatalogRow[]) {
  return {
    listFileCatalogExpectedRows: vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        rows ??
          [...ids].sort().map(id =>
            appliedRow(
              value,
              value.dispositions.findIndex(entry => entry.file_catalog_id === id)
            )
          )
      )
    ),
  };
}

function state(value: SourceRecoveryManifest) {
  return {
    manifest: value,
    manifestSha256: calculateRecoveryManifestSha256(value),
    journal: journal(value),
  };
}

describe('accepted coverage authority token', () => {
  it('parses and formats the file_catalog authority token', () => {
    expect(formatAcceptedCoverageAuthority(RECOVERY_RUN_ID)).toBe(`catalog:${RECOVERY_RUN_ID}`);
    expect(parseAcceptedCoverageAuthority(`catalog:${RECOVERY_RUN_ID}`)).toEqual({
      source: 'file_catalog',
      recoveryRunId: RECOVERY_RUN_ID,
    });
  });

  it.each([
    ['legacy ledger triple', `${ORGANIZATION_ID}:${COURSE_A_ID}:${RECOVERY_RUN_ID}`],
    ['empty run', 'catalog:'],
    ['bare run', RECOVERY_RUN_ID],
    ['trailing segment', `catalog:${RECOVERY_RUN_ID}:${COURSE_A_ID}`],
    ['upper-case run', 'catalog:E1B2C3D4-0000-4000-8000-00000000000A'],
    ['foreign namespace', `ledger:${RECOVERY_RUN_ID}`],
  ])('rejects a %s authority token', (_label, value) => {
    expect(() => parseAcceptedCoverageAuthority(value)).toThrow(
      /must be catalog:<recovery-run-id>/iu
    );
  });

  it('rejects an authority token naming a different recovery run', () => {
    expect(() =>
      normalizeSourceRecoveryReindexAdapterConfig({
        ...config(),
        acceptedCoverageAuthority: formatAcceptedCoverageAuthority(FOREIGN_RUN_ID),
      })
    ).toThrow(/authority.*recovery run|recovery run.*authority/iu);
  });
});

describe('source recovery reindex adapters', () => {
  it('loads an exact canonical sorted multi-scope binding from the recovered file_catalog rows', async () => {
    const value = manifest();
    const loadReviewedRecoveryState = vi.fn().mockResolvedValue(state(value));
    const catalogRepository = repository(value);
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState,
      persistRecoveryJournalTransition: vi.fn(),
      catalogRepository,
    });

    const result = await adapters.loadRecoveryBinding();

    expect(loadReviewedRecoveryState).toHaveBeenCalledWith({
      manifestPath: '/secure/recovery/manifest.json',
      journalPath: '/secure/recovery/journal.json',
    });
    expect(catalogRepository.listFileCatalogExpectedRows.mock.calls).toEqual([
      [value.dispositions.map(entry => entry.file_catalog_id).sort()],
    ]);
    expect(result.acceptedFailedCoverage.source).toBe('file_catalog');
    expect(result.acceptedFailedCoverage.scopes.map(coverageScopeKey)).toEqual([
      `${ORGANIZATION_ID}:${COURSE_A_ID}`,
      `${ORGANIZATION_ID}:${COURSE_B_ID}`,
    ]);
    expect(result.acceptedFailedCoverage.scopes.flatMap(scope => scope.entries)).toHaveLength(6);
    expect(result.acceptedFailedCoverage.fingerprint).toBe(
      config(value).expectedCoverageFingerprint
    );
  });

  it.each([
    ['recovery run', { expectedRecoveryRunId: '54000000-0000-4000-8000-000000000005' }],
    ['manifest SHA', { expectedRecoveryManifestSha256: 'f'.repeat(64) }],
    ['coverage fingerprint', { expectedCoverageFingerprint: 'e'.repeat(64) }],
  ])('rejects stale configured %s', async (_label, patch) => {
    const value = manifest();
    await expect(async () => {
      const adapters = createSourceRecoveryReindexAdapters(
        { ...config(value), ...patch },
        {
          loadReviewedRecoveryState: vi.fn().mockResolvedValue(state(value)),
          persistRecoveryJournalTransition: vi.fn(),
          catalogRepository: repository(value),
        }
      );
      await adapters.loadRecoveryBinding();
    }).rejects.toThrow();
  });

  it('rejects an unreadable file_catalog coverage read', async () => {
    const value = manifest();
    const catalogRepository = repository(value);
    catalogRepository.listFileCatalogExpectedRows.mockRejectedValueOnce(new Error('no capability'));
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue(state(value)),
      persistRecoveryJournalTransition: vi.fn(),
      catalogRepository,
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(/accepted coverage/iu);
  });

  it.each([
    ['vector status', { vector_status: 'indexed' as const }],
    ['recovery marker', { error_message: expectedCoverageErrorMessage(FOREIGN_RUN_ID) }],
    ['null marker', { error_message: null }],
    ['hash', { hash: 'f'.repeat(64) }],
    ['storage path', { storage_path: 'uploads/org/course/other.pdf' }],
    ['organization', { organization_id: FOREIGN_ORGANIZATION_ID }],
    ['course', { course_id: COURSE_B_ID }],
  ])('rejects a recovered row with a stale %s', async (_label, patch) => {
    const value = manifest();
    const rows = value.dispositions.map((_entry, index) =>
      appliedRow(value, index, index === 0 ? patch : {})
    );
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue(state(value)),
      persistRecoveryJournalTransition: vi.fn(),
      catalogRepository: repository(value, rows),
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(
      /file_catalog row is not the exact recovered disposition state/iu
    );
  });

  it.each([
    ['missing', (rows: RecoveryCatalogRow[]) => rows.slice(0, 5)],
    [
      'extra',
      (rows: RecoveryCatalogRow[]) => [
        ...rows,
        { ...rows[0], id: 'e0000000-0000-4000-8000-000000000099' },
      ],
    ],
  ])('rejects a %s recovered coverage identity', async (_label, mutate) => {
    const value = manifest();
    const rows = mutate(value.dispositions.map((_entry, index) => appliedRow(value, index)));
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue(state(value)),
      persistRecoveryJournalTransition: vi.fn(),
      catalogRepository: repository(value, rows),
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(/coverage/iu);
  });

  it.each([
    ['organization', 'organization_id'],
    ['course', 'course_id'],
  ])('rejects a manifest %s identity that is not a lower-case UUIDv4', async (_label, field) => {
    const value = manifest();
    // z.string().uuid() in the manifest schema accepts upper-case hex, so the coverage binding must
    // reject it here instead of letting C6 reindex.plan fail later inside the window.
    const current = value.dispositions[0][field as 'organization_id' | 'course_id']!;
    const upperCased = `B${current.slice(1)}`;
    value.dispositions[0] = {
      ...value.dispositions[0],
      [field]: upperCased,
    } as (typeof value.dispositions)[number];
    const rows = value.dispositions.map((_entry, index) => appliedRow(value, index));
    const sha256 = calculateRecoveryManifestSha256(value);
    const adapters = createSourceRecoveryReindexAdapters(
      {
        ...config(),
        expectedRecoveryManifestSha256: sha256,
        acceptedCoverageAuthority: formatAcceptedCoverageAuthority(value.run_id),
      },
      {
        loadReviewedRecoveryState: vi.fn().mockResolvedValue({
          manifest: value,
          manifestSha256: sha256,
          journal: journal(value),
        }),
        persistRecoveryJournalTransition: vi.fn(),
        catalogRepository: repository(value, rows),
      }
    );

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(
      /coverage scopes must be unique lower-case UUIDv4/iu
    );
  });

  it('pins the canonical coverage fingerprint to a golden constant', async () => {
    // Guards the SERIALIZATION contract: the fixture-derived oracles elsewhere recompute the
    // fingerprint with the function under test, so only this literal detects a silent change to the
    // hashed field set (which would shift the window's <accepted-coverage-fingerprint>).
    const value = manifest();
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue(state(value)),
      persistRecoveryJournalTransition: vi.fn(),
      catalogRepository: repository(value),
    });

    const binding = await adapters.loadRecoveryBinding();

    expect(binding.acceptedFailedCoverage.fingerprint).toBe(GOLDEN_COVERAGE_FINGERPRINT);
  });

  it('uses crash-durable CAS then rejects a journal echo without an independent persisted reload', async () => {
    const value = manifest();
    const current = journal(value);
    const next = journal(value, 49);
    const loadReviewedRecoveryState = vi.fn().mockResolvedValue({
      manifest: value,
      manifestSha256: calculateRecoveryManifestSha256(value),
      journal: current,
    });
    const persistRecoveryJournalTransition = vi.fn().mockResolvedValue(undefined);
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState,
      persistRecoveryJournalTransition,
      catalogRepository: repository(value),
    });

    await expect(
      adapters.persistRecoveryJournalTransition({ expectedRevision: 48, next })
    ).rejects.toThrow(/reload|persisted/iu);
    expect(persistRecoveryJournalTransition).toHaveBeenCalledWith({
      journalPath: '/secure/recovery/journal.json',
      manifest: value,
      current,
      next,
    });
    expect(loadReviewedRecoveryState).toHaveBeenCalledTimes(2);
  });

  it('accepts only the exact independently reloaded journal transition', async () => {
    const value = manifest();
    const current = journal(value);
    const next = journal(value, 49);
    const loadReviewedRecoveryState = vi
      .fn()
      .mockResolvedValueOnce({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal: current,
      })
      .mockResolvedValueOnce({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal: next,
      });
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState,
      persistRecoveryJournalTransition: vi.fn().mockResolvedValue(undefined),
      catalogRepository: repository(value),
    });

    await expect(
      adapters.persistRecoveryJournalTransition({ expectedRevision: 48, next })
    ).resolves.toBeUndefined();
  });
});
