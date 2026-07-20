import { describe, expect, it, vi } from 'vitest';

import {
  calculateAcceptedFailedCoverageFingerprint,
  type AcceptedFailedCoverageBinding,
} from '../../../../tools/qdrant/reindex-plan';
import {
  createSourceRecoveryReindexAdapters,
  type SourceRecoveryReindexAdapterConfig,
} from '../../../../tools/qdrant/source-recovery-reindex-adapters';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

const RECOVERY_RUN_ID = '51000000-0000-4000-8000-000000000005';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const COURSE_A_ID = '20000000-0000-4000-8000-000000000002';
const COURSE_B_ID = '22000000-0000-4000-8000-000000000002';
const RUN_A_ID = '52000000-0000-4000-8000-000000000005';
const RUN_B_ID = '53000000-0000-4000-8000-000000000005';

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

function failedCard(documentId: string): Record<string, unknown> {
  return {
    document_id: documentId,
    document_name: `Document ${documentId.slice(-1)}`,
    priority: 'CORE',
    authority_scope: 'course_source',
    content_quality: 0,
    course_relevance: 0,
    processing_mode: 'metadata_only',
    summary: null,
    key_claims: [],
    terminology: [],
    constraints: [],
    limitations: [],
    coverage_status: 'failed',
    coverage_reason: 'source_file_unrecoverable',
    token_counts: { original: 0, summary: 0, allocated: 0 },
  };
}

function ledgerBinding(
  value: SourceRecoveryManifest,
  sha256: string,
  fingerprint = ''
): AcceptedFailedCoverageBinding {
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    recoveryRunId: value.run_id,
    recoveryManifestSha256: sha256,
    fingerprint,
    ledgers: [
      {
        ledgerId: RUN_A_ID,
        status: 'accepted',
        organizationId: ORGANIZATION_ID,
        courseId: COURSE_A_ID,
        entries: value.dispositions.slice(0, 4).map(entry => ({
          documentId: entry.file_catalog_id,
          organizationId: entry.organization_id,
          courseId: entry.course_id!,
          coverageStatus: 'failed',
          coverageReason: 'source_file_unrecoverable',
          processingMode: 'metadata_only',
          summary: null,
          claims: [],
          terminology: [],
          constraints: [],
          allocatedTokens: 0,
        })),
      },
      {
        ledgerId: RUN_B_ID,
        status: 'accepted',
        organizationId: ORGANIZATION_ID,
        courseId: COURSE_B_ID,
        entries: value.dispositions.slice(4).map(entry => ({
          documentId: entry.file_catalog_id,
          organizationId: entry.organization_id,
          courseId: entry.course_id!,
          coverageStatus: 'failed',
          coverageReason: 'source_file_unrecoverable',
          processingMode: 'metadata_only',
          summary: null,
          claims: [],
          terminology: [],
          constraints: [],
          allocatedTokens: 0,
        })),
      },
    ],
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  return binding;
}

function config(value = manifest()): SourceRecoveryReindexAdapterConfig {
  const sha256 = calculateRecoveryManifestSha256(value);
  const binding = ledgerBinding(value, sha256);
  return {
    manifestPath: '/secure/recovery/manifest.json',
    journalPath: '/secure/recovery/journal.json',
    expectedRecoveryRunId: value.run_id,
    expectedRecoveryManifestSha256: sha256,
    expectedCoverageFingerprint: binding.fingerprint,
    acceptedCoverageRuns: [
      { organizationId: ORGANIZATION_ID, courseId: COURSE_B_ID, runId: RUN_B_ID },
      { organizationId: ORGANIZATION_ID, courseId: COURSE_A_ID, runId: RUN_A_ID },
    ],
  };
}

function repository(value = manifest()) {
  return {
    getAcceptedRun: vi.fn((runId: string) => Promise.resolve({ id: runId, status: 'accepted' })),
    listItems: vi.fn((runId: string) =>
      Promise.resolve(
        (runId === RUN_A_ID ? value.dispositions.slice(0, 4) : value.dispositions.slice(4)).map(
          entry => failedCard(entry.file_catalog_id)
        )
      )
    ),
  };
}

describe('source recovery reindex adapters', () => {
  it('loads an exact canonical sorted multi-ledger binding through accepted workflow/repository seams', async () => {
    const value = manifest();
    const sha256 = calculateRecoveryManifestSha256(value);
    const recoveryJournal = journal(value);
    const loadReviewedRecoveryState = vi.fn().mockResolvedValue({
      manifest: value,
      manifestSha256: sha256,
      journal: recoveryJournal,
    });
    const evidenceRepository = repository(value);
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState,
      persistRecoveryJournalTransition: vi.fn(),
      evidenceRepository,
    });

    const result = await adapters.loadRecoveryBinding();

    expect(loadReviewedRecoveryState).toHaveBeenCalledWith({
      manifestPath: '/secure/recovery/manifest.json',
      journalPath: '/secure/recovery/journal.json',
    });
    expect(evidenceRepository.getAcceptedRun.mock.calls).toEqual([
      [RUN_A_ID, COURSE_A_ID, ORGANIZATION_ID],
      [RUN_B_ID, COURSE_B_ID, ORGANIZATION_ID],
    ]);
    expect(result.acceptedFailedCoverage.ledgers.map(ledger => ledger.ledgerId)).toEqual([
      RUN_A_ID,
      RUN_B_ID,
    ]);
    expect(result.acceptedFailedCoverage.ledgers.flatMap(ledger => ledger.entries)).toHaveLength(6);
    expect(result.acceptedFailedCoverage.fingerprint).toBe(
      config(value).expectedCoverageFingerprint
    );
  });

  it.each([
    [
      'missing course ledger',
      (input: SourceRecoveryReindexAdapterConfig) => ({
        ...input,
        acceptedCoverageRuns: input.acceptedCoverageRuns.slice(0, 1),
      }),
    ],
    [
      'duplicate course ledger',
      (input: SourceRecoveryReindexAdapterConfig) => ({
        ...input,
        acceptedCoverageRuns: [...input.acceptedCoverageRuns, input.acceptedCoverageRuns[0]],
      }),
    ],
    [
      'duplicate accepted run',
      (input: SourceRecoveryReindexAdapterConfig) => ({
        ...input,
        acceptedCoverageRuns: input.acceptedCoverageRuns.map(run => ({ ...run, runId: RUN_A_ID })),
      }),
    ],
    [
      'cross-tenant course ledger',
      (input: SourceRecoveryReindexAdapterConfig) => ({
        ...input,
        acceptedCoverageRuns: input.acceptedCoverageRuns.map((run, index) =>
          index === 0 ? { ...run, organizationId: '11000000-0000-4000-8000-000000000001' } : run
        ),
      }),
    ],
  ])('rejects %s configuration', async (_label, mutate) => {
    const value = manifest();
    await expect(async () => {
      const adapters = createSourceRecoveryReindexAdapters(mutate(config(value)), {
        loadReviewedRecoveryState: vi.fn().mockResolvedValue({
          manifest: value,
          manifestSha256: calculateRecoveryManifestSha256(value),
          journal: journal(value),
        }),
        persistRecoveryJournalTransition: vi.fn(),
        evidenceRepository: repository(value),
      });
      await adapters.loadRecoveryBinding();
    }).rejects.toThrow();
  });

  it.each([
    ['recovery run', { expectedRecoveryRunId: '54000000-0000-4000-8000-000000000005' }],
    ['manifest SHA', { expectedRecoveryManifestSha256: 'f'.repeat(64) }],
    ['coverage fingerprint', { expectedCoverageFingerprint: 'e'.repeat(64) }],
  ])('rejects stale configured %s', async (_label, patch) => {
    const value = manifest();
    const adapters = createSourceRecoveryReindexAdapters(
      { ...config(value), ...patch },
      {
        loadReviewedRecoveryState: vi.fn().mockResolvedValue({
          manifest: value,
          manifestSha256: calculateRecoveryManifestSha256(value),
          journal: journal(value),
        }),
        persistRecoveryJournalTransition: vi.fn(),
        evidenceRepository: repository(value),
      }
    );

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow();
  });

  it('rejects a missing or rejected accepted evidence run', async () => {
    const value = manifest();
    const evidenceRepository = repository(value);
    evidenceRepository.getAcceptedRun.mockRejectedValueOnce(new Error('not accepted'));
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal: journal(value),
      }),
      persistRecoveryJournalTransition: vi.fn(),
      evidenceRepository,
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(/accepted coverage/iu);
  });

  it.each([
    ['status', { coverage_status: 'degraded' }],
    ['reason', { coverage_reason: 'source_content_unavailable' }],
    ['mode', { processing_mode: 'summary' }],
    ['summary', { summary: 'derived content' }],
    ['claims', { key_claims: ['claim'] }],
    ['terminology', { terminology: ['term'] }],
    ['constraints', { constraints: ['constraint'] }],
    ['allocation', { token_counts: { original: 0, summary: 0, allocated: 1 } }],
  ])('rejects a failed coverage card with stale %s shape', async (_label, patch) => {
    const value = manifest();
    const evidenceRepository = repository(value);
    evidenceRepository.listItems.mockImplementation((runId: string) =>
      Promise.resolve(
        (runId === RUN_A_ID ? value.dispositions.slice(0, 4) : value.dispositions.slice(4)).map(
          (entry, index) => ({
            ...failedCard(entry.file_catalog_id),
            ...(index === 0 ? patch : {}),
          })
        )
      )
    );
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal: journal(value),
      }),
      persistRecoveryJournalTransition: vi.fn(),
      evidenceRepository,
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(/coverage/iu);
  });

  it('rejects missing and extra eligible coverage identities', async () => {
    const value = manifest();
    const evidenceRepository = repository(value);
    evidenceRepository.listItems.mockResolvedValueOnce(
      value.dispositions.slice(0, 3).map(entry => failedCard(entry.file_catalog_id))
    );
    const adapters = createSourceRecoveryReindexAdapters(config(value), {
      loadReviewedRecoveryState: vi.fn().mockResolvedValue({
        manifest: value,
        manifestSha256: calculateRecoveryManifestSha256(value),
        journal: journal(value),
      }),
      persistRecoveryJournalTransition: vi.fn(),
      evidenceRepository,
    });

    await expect(adapters.loadRecoveryBinding()).rejects.toThrow(/coverage/iu);
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
      evidenceRepository: repository(value),
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
      evidenceRepository: repository(value),
    });

    await expect(
      adapters.persistRecoveryJournalTransition({ expectedRevision: 48, next })
    ).resolves.toBeUndefined();
  });
});
