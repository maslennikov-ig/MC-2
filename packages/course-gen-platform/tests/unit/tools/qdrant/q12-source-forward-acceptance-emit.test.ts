import { describe, expect, it, vi } from 'vitest';

import {
  calculateAcceptedFailedCoverageFingerprint,
  expectedCoverageErrorMessage,
  type AcceptedFailedCoverageBinding,
} from '../../../../tools/qdrant/reindex-plan';
import { computeSourceForwardAcceptance } from '../../../../tools/qdrant/source-recovery-reindex-adapters';
import type { RecoveryCatalogRow } from '../../../../tools/qdrant/source-recovery-database';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

// W7a real leg (emit half): computeSourceForwardAcceptance is the TS acceptance emit-entrypoint the
// controller's read_source_forward_acceptance consumes. It COMPUTES (never validates-against-expected)
// the canonical recovery manifest sha256 + calculateAcceptedFailedCoverageFingerprint over the recovered
// file_catalog rows + the `catalog:<recovery-run-id>` authority token the frozen manifest's single
// <accepted-coverage-run> slot carries. The fixture mirrors the live 2026-07-12 audit shape — six
// eligible dispositions across three organizations and six courses — because the accepted amendment
// derives scopes from the sha-bound manifest instead of argv. Infra-free (synthetic manifest + fake
// file_catalog repository), mirroring the adapter test.
const RECOVERY_RUN_ID = '51000000-0000-4000-8000-000000000005';
const FOREIGN_RUN_ID = '54000000-0000-4000-8000-000000000005';

function organizationId(index: number): string {
  return `1${index}000000-0000-4000-8000-000000000001`;
}

function courseId(index: number): string {
  return `2${index}000000-0000-4000-8000-000000000002`;
}

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
    pre_counts: { total: 6, eligible: 6, recoverable: 0, missing: 4, invalid: 2, unsupported: 0 },
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
      // Three organizations, six distinct courses — the accepted live audit truth.
      file_catalog_id: fileId(index),
      organization_id: organizationId(index % 3),
      course_id: courseId(index),
      expected_hash: 'a'.repeat(64),
      expected_storage_path: `uploads/org/course/audited-${index}.pdf`,
      expected_vector_status: 'pending' as const,
      expected_file_error_message: null,
      reason: 'source_file_unrecoverable' as const,
    })),
  };
}

function journal(value: SourceRecoveryManifest, revision = 48): RecoveryProgressJournal {
  return {
    schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
    run_id: value.run_id,
    manifest_sha256: calculateRecoveryManifestSha256(value),
    revision,
    phase: 'verified',
    copy_states: {},
    disposition_kinds: Object.fromEntries(
      value.dispositions.map(entry => [entry.entry_id, entry.kind])
    ),
    disposition_states: Object.fromEntries(
      value.dispositions.map(entry => [entry.entry_id, 'disposition_verified'])
    ),
  };
}

function recoveredRows(
  value: SourceRecoveryManifest,
  patch: Partial<RecoveryCatalogRow> = {}
): RecoveryCatalogRow[] {
  return value.dispositions.map((entry, index) => ({
    id: entry.file_catalog_id,
    organization_id: entry.organization_id,
    course_id: entry.course_id,
    storage_path: entry.expected_storage_path,
    hash: entry.expected_hash,
    vector_status: 'failed' as const,
    error_message: expectedCoverageErrorMessage(value.run_id),
    ...(index === 0 ? patch : {}),
  }));
}

function deps(value = manifest(), rows = recoveredRows(value)) {
  return {
    loadReviewedRecoveryState: vi.fn().mockResolvedValue({
      manifest: value,
      manifestSha256: calculateRecoveryManifestSha256(value),
      journal: journal(value),
    }),
    catalogRepository: {
      listFileCatalogExpectedRows: vi.fn(() => Promise.resolve(rows)),
    },
  };
}

function emitConfig(value = manifest()) {
  return {
    manifestPath: '/secure/recovery/manifest.json',
    journalPath: '/secure/recovery/journal.json',
    expectedRecoveryRunId: value.run_id,
    acceptedCoverageAuthority: `catalog:${value.run_id}`,
  };
}

// The authority computeSourceForwardAcceptance must EMIT — derived here independently from the fixtures
// so the test proves it recomputes, not echoes.
function expectedAuthority(value = manifest()) {
  const sha256 = calculateRecoveryManifestSha256(value);
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    source: 'file_catalog',
    recoveryRunId: value.run_id,
    recoveryManifestSha256: sha256,
    fingerprint: '',
    scopes: value.dispositions
      .map(entry => ({
        organizationId: entry.organization_id,
        courseId: entry.course_id!,
        entries: [
          {
            fileCatalogId: entry.file_catalog_id,
            organizationId: entry.organization_id,
            courseId: entry.course_id!,
            storagePath: entry.expected_storage_path,
            hash: entry.expected_hash,
            vectorStatus: 'failed' as const,
            errorMessage: expectedCoverageErrorMessage(value.run_id),
          },
        ],
      }))
      .sort((left, right) =>
        `${left.organizationId}:${left.courseId}`.localeCompare(
          `${right.organizationId}:${right.courseId}`
        )
      ),
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  return {
    schema: 'megacampus.q12.source-forward-acceptance/v1',
    recovery_manifest_sha256: sha256,
    coverage_fingerprint: binding.fingerprint,
    coverage_run: `catalog:${value.run_id}`,
  };
}

describe('W7a real leg: computeSourceForwardAcceptance (source.forward acceptance emit-entrypoint)', () => {
  it('computes the canonical manifest sha256, six-scope coverage fingerprint, and catalog authority token', async () => {
    const value = manifest();
    const authority = await computeSourceForwardAcceptance(emitConfig(value), deps(value));
    expect(authority).toEqual(expectedAuthority(value));
  });

  it('reads exactly the six recovered file_catalog identities', async () => {
    const value = manifest();
    const dependencies = deps(value);
    await computeSourceForwardAcceptance(emitConfig(value), dependencies);
    expect(dependencies.catalogRepository.listFileCatalogExpectedRows.mock.calls).toEqual([
      [value.dispositions.map(entry => entry.file_catalog_id).sort()],
    ]);
  });

  it('fails closed on the legacy org:course:run coverage token', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        {
          ...emitConfig(value),
          acceptedCoverageAuthority: `${organizationId(0)}:${courseId(0)}:${value.run_id}`,
        },
        deps(value)
      )
    ).rejects.toThrow(/must be catalog:<recovery-run-id>/iu);
  });

  it('fails closed when the authority token names another recovery run', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        { ...emitConfig(value), acceptedCoverageAuthority: `catalog:${FOREIGN_RUN_ID}` },
        deps(value)
      )
    ).rejects.toThrow(/authority.*recovery run|recovery run.*authority/iu);
  });

  it('fails closed on a stale recovery run id (never emits mismatched authority)', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        { ...emitConfig(value), expectedRecoveryRunId: FOREIGN_RUN_ID },
        deps(value)
      )
    ).rejects.toThrow();
  });

  it('fails closed when a recovered row is missing the run-scoped unrecoverable marker', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        emitConfig(value),
        deps(value, recoveredRows(value, { error_message: 'source_file_unrecoverable' }))
      )
    ).rejects.toThrow(/recovered disposition state/iu);
  });
});
