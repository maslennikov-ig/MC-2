import { describe, expect, it, vi } from 'vitest';

import { calculateAcceptedFailedCoverageFingerprint } from '../../../../tools/qdrant/reindex-plan';
import { computeSourceForwardAcceptance } from '../../../../tools/qdrant/source-recovery-reindex-adapters';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

// W7a real leg (emit half): computeSourceForwardAcceptance is the TS acceptance emit-entrypoint the
// controller's read_source_forward_acceptance consumes. It COMPUTES (never validates-against-expected)
// the canonical recovery manifest sha256 + calculateAcceptedFailedCoverageFingerprint + the single
// bound org:course:run scope the frozen manifest's one <accepted-coverage-run> slot expects. The
// window recovery is single-course-scoped, so exactly one accepted coverage run is bound. Infra-free
// (synthetic single-course manifest + fake evidence repository), mirroring the adapter test.
const RECOVERY_RUN_ID = '51000000-0000-4000-8000-000000000005';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const COURSE_ID = '20000000-0000-4000-8000-000000000002';
const RUN_ID = '52000000-0000-4000-8000-000000000005';

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
      file_catalog_id: fileId(index),
      organization_id: ORGANIZATION_ID,
      course_id: COURSE_ID,
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

function deps(value = manifest()) {
  return {
    loadReviewedRecoveryState: vi.fn().mockResolvedValue({
      manifest: value,
      manifestSha256: calculateRecoveryManifestSha256(value),
      journal: journal(value),
    }),
    evidenceRepository: {
      getAcceptedRun: vi.fn((runId: string) => Promise.resolve({ id: runId, status: 'accepted' })),
      listItems: vi.fn(() =>
        Promise.resolve(value.dispositions.map(entry => failedCard(entry.file_catalog_id)))
      ),
    },
  };
}

function emitConfig(value = manifest()) {
  return {
    manifestPath: '/secure/recovery/manifest.json',
    journalPath: '/secure/recovery/journal.json',
    expectedRecoveryRunId: value.run_id,
    acceptedCoverageRuns: [{ organizationId: ORGANIZATION_ID, courseId: COURSE_ID, runId: RUN_ID }],
  };
}

// The authority computeSourceForwardAcceptance must EMIT — derived here independently from the fixtures
// so the test proves it recomputes, not echoes.
function expectedAuthority(value = manifest()) {
  const sha256 = calculateRecoveryManifestSha256(value);
  const binding = {
    status: 'accepted' as const,
    recoveryRunId: value.run_id,
    recoveryManifestSha256: sha256,
    fingerprint: '',
    ledgers: [
      {
        ledgerId: RUN_ID,
        status: 'accepted' as const,
        organizationId: ORGANIZATION_ID,
        courseId: COURSE_ID,
        entries: value.dispositions.map(entry => ({
          documentId: entry.file_catalog_id,
          organizationId: entry.organization_id,
          courseId: entry.course_id!,
          coverageStatus: 'failed' as const,
          coverageReason: 'source_file_unrecoverable' as const,
          processingMode: 'metadata_only' as const,
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
  return {
    schema: 'megacampus.q12.source-forward-acceptance/v1',
    recovery_manifest_sha256: sha256,
    coverage_fingerprint: binding.fingerprint,
    coverage_run: `${ORGANIZATION_ID}:${COURSE_ID}:${RUN_ID}`,
  };
}

describe('W7a real leg: computeSourceForwardAcceptance (source.forward acceptance emit-entrypoint)', () => {
  it('computes the canonical manifest sha256, coverage fingerprint, and single org:course:run scope', async () => {
    const value = manifest();
    const authority = await computeSourceForwardAcceptance(emitConfig(value), deps(value));
    expect(authority).toEqual(expectedAuthority(value));
  });

  it('fails closed when more than one coverage run is bound (frozen manifest binds exactly one)', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        {
          ...emitConfig(value),
          acceptedCoverageRuns: [
            { organizationId: ORGANIZATION_ID, courseId: COURSE_ID, runId: RUN_ID },
            { organizationId: ORGANIZATION_ID, courseId: COURSE_ID, runId: RUN_ID },
          ],
        },
        deps(value)
      )
    ).rejects.toThrow(/exactly one|single/iu);
  });

  it('fails closed on a stale recovery run id (never emits mismatched authority)', async () => {
    const value = manifest();
    await expect(
      computeSourceForwardAcceptance(
        { ...emitConfig(value), expectedRecoveryRunId: '54000000-0000-4000-8000-000000000005' },
        deps(value)
      )
    ).rejects.toThrow();
  });
});
