import { vi } from 'vitest';
import {
  buildReindexJobId,
  type ReindexCommandDependencies,
} from '../../../../tools/qdrant/reindex-course-embeddings';
import {
  buildReindexPlan,
  calculateAcceptedFailedCoverageFingerprint,
  calculateReindexVerificationFingerprint,
  type IndexedDocumentIdentity,
  type RecoveryReindexBinding,
  type ReindexRelevanceCheck,
  type ReindexSourceRow,
} from '../../../../tools/qdrant/reindex-plan';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

export const RUN_ID = '50000000-0000-4000-8000-000000000005';
export const TARGET = 'course_embeddings_v2';

export function source(id: string, locale: 'ru' | 'en' = 'ru'): ReindexSourceRow {
  return {
    id,
    organizationId: '10000000-0000-4000-8000-000000000001',
    courseId: '20000000-0000-4000-8000-000000000002',
    courseOrganizationId: '10000000-0000-4000-8000-000000000001',
    userId: '30000000-0000-4000-8000-000000000003',
    storagePath: `uploads/org/course/${id}.pdf`,
    mimeType: 'application/pdf',
    priority: 'CORE',
    hash: 'a'.repeat(64),
    vectorStatus: 'indexed',
    errorMessage: null,
    chunkCount: 3,
    locale,
    alreadyEnqueued: false,
  };
}

export function recoveryFixture(
  rows: readonly ReindexSourceRow[],
  phase: 'verified' | 'reindex_started' | 'complete' = 'verified'
): {
  rows: ReindexSourceRow[];
  binding: RecoveryReindexBinding;
  plan: ReturnType<typeof buildReindexPlan>;
} {
  const auditedRows = Array.from({ length: 6 }, (_, index) => {
    const id = `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    return {
      ...source(id),
      storagePath: `uploads/org/course/audited-${index}.pdf`,
      vectorStatus: 'failed',
      errorMessage: `source_file_unrecoverable; recovery_run=51000000-0000-4000-8000-000000000005`,
    };
  });
  const manifest: SourceRecoveryManifest = {
    schema_version: 'megacampus.qdrant.source-recovery/v1',
    run_id: '51000000-0000-4000-8000-000000000005',
    release_sha: 'b'.repeat(40),
    generated_at: '2026-07-12T12:00:00.000Z',
    operator_image_digest: `sha256:${'c'.repeat(64)}`,
    source_audit_version: 'unit-reviewed-v1',
    development_root: '/srv/megacampus/uploads-dev',
    production_root: '/srv/megacampus/uploads',
    pre_counts: {
      total: rows.length + 6,
      eligible: rows.length + 6,
      recoverable: rows.length,
      missing: 4,
      invalid: 2,
      unsupported: 0,
    },
    expected_post_counts: {
      total: rows.length + 6,
      eligible: rows.length + 6,
      recoverable: rows.length,
      missing: 4,
      invalid: 2,
      unsupported: 0,
    },
    copies: [],
    dispositions: auditedRows.map((row, index) => ({
      entry_id: `eligible-${index}`,
      kind: 'eligible_unrecoverable',
      file_catalog_id: row.id,
      organization_id: row.organizationId,
      course_id: row.courseId,
      expected_hash: row.hash,
      expected_storage_path: row.storagePath,
      expected_vector_status: 'pending',
      expected_file_error_message: null,
      reason: 'source_file_unrecoverable',
    })),
  };
  const manifestSha256 = calculateRecoveryManifestSha256(manifest);
  const journal: RecoveryProgressJournal = {
    schema_version: 'megacampus.qdrant.source-recovery-progress/v1',
    run_id: manifest.run_id,
    manifest_sha256: manifestSha256,
    revision: phase === 'verified' ? 12 : phase === 'reindex_started' ? 13 : 14,
    phase,
    copy_states: {},
    disposition_kinds: Object.fromEntries(
      manifest.dispositions.map(entry => [entry.entry_id, entry.kind])
    ),
    disposition_states: Object.fromEntries(
      manifest.dispositions.map(entry => [entry.entry_id, 'disposition_verified'])
    ),
  };
  const binding: RecoveryReindexBinding = {
    manifest,
    manifestSha256,
    journal,
    acceptedFailedCoverage: {
      status: 'accepted',
      source: 'file_catalog',
      recoveryRunId: manifest.run_id,
      recoveryManifestSha256: manifestSha256,
      fingerprint: '',
      scopes: [
        {
          organizationId: auditedRows[0].organizationId,
          courseId: auditedRows[0].courseId!,
          entries: auditedRows.map(row => ({
            fileCatalogId: row.id,
            organizationId: row.organizationId,
            courseId: row.courseId!,
            storagePath: row.storagePath,
            hash: row.hash,
            vectorStatus: 'failed',
            errorMessage: `source_file_unrecoverable; recovery_run=${manifest.run_id}`,
          })),
        },
      ],
    },
  };
  binding.acceptedFailedCoverage.fingerprint = calculateAcceptedFailedCoverageFingerprint(
    binding.acceptedFailedCoverage
  );
  const allRows = [...rows, ...auditedRows];
  const invalidIds = new Set(auditedRows.slice(4).map(row => row.id));
  const plan = buildReindexPlan(
    allRows,
    row => (invalidIds.has(row.id) ? 'invalid_source_path' : rows.includes(row)),
    binding
  );
  return { rows: allRows, binding, plan };
}

export function verifiedCoverageIds(binding: RecoveryReindexBinding): string[] {
  return binding.acceptedFailedCoverage.scopes.flatMap(scope =>
    scope.entries.map(entry => entry.fileCatalogId)
  );
}

export function indexed(row: ReindexSourceRow): IndexedDocumentIdentity {
  return {
    documentId: row.id,
    courseId: row.courseId!,
    organizationId: row.organizationId,
    pointCount: row.chunkCount ?? 0,
  };
}

export function dependencies(
  rows: ReindexSourceRow[],
  overrides: Partial<ReindexCommandDependencies> = {}
): ReindexCommandDependencies {
  const recovery = recoveryFixture(rows);
  let currentRecoveryBinding = recovery.binding;
  const coverageIds = verifiedCoverageIds(recovery.binding);
  const auditedIds = new Set(coverageIds);
  const invalidIds = new Set(coverageIds.slice(4));
  const relevanceChecks: ReindexRelevanceCheck[] = [
    { language: 'ru', passed: true, nativeHybrid: true },
    { language: 'en', passed: true, nativeHybrid: true },
  ];
  return {
    loadSources: vi.fn().mockResolvedValue(recovery.rows),
    probeSources: vi.fn().mockResolvedValue({
      availableFileIds: new Set(rows.map(row => row.id).filter(id => !auditedIds.has(id))),
      invalidPathFileIds: invalidIds,
      resolvedFilePaths: new Map(rows.map(row => [row.id, `/safe/uploads/${row.id}.pdf`] as const)),
    }),
    loadRecoveryBinding: vi.fn(() => Promise.resolve(structuredClone(currentRecoveryBinding))),
    persistRecoveryJournalTransition: vi.fn(({ next }) => {
      currentRecoveryBinding = { ...currentRecoveryBinding, journal: structuredClone(next) };
      return Promise.resolve();
    }),
    verifyPhysicalTarget: vi.fn().mockResolvedValue({ ok: true, mismatches: [] }),
    enqueueJob: vi.fn().mockResolvedValue({
      waitForTerminal: vi.fn().mockResolvedValue(undefined),
    }),
    loadArtifact: vi.fn().mockResolvedValue(null),
    inspectJobs: vi.fn().mockResolvedValue([]),
    removeJob: vi.fn().mockResolvedValue(undefined),
    persistArtifact: vi.fn().mockResolvedValue(undefined),
    loadIndexedDocuments: vi.fn().mockResolvedValue(rows.map(indexed)),
    runRelevanceChecks: vi.fn().mockResolvedValue(relevanceChecks),
    now: () => new Date('2026-07-10T12:00:00.000Z'),
    createRunId: () => RUN_ID,
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function executionLedger(
  rows: ReindexSourceRow[],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const recovery = recoveryFixture(rows, 'reindex_started');
  const plannedJobIds = rows.map(row => buildReindexJobId(RUN_ID, row.id));
  const ledger: Record<string, any> = {
    schemaVersion: 4,
    mode: 'execute',
    runId: RUN_ID,
    targetCollection: TARGET,
    recoveryRunId: recovery.binding.manifest.run_id,
    recoveryManifestSha256: recovery.binding.manifestSha256,
    acceptedCoverageScopes: recovery.binding.acceptedFailedCoverage.scopes
      .map(scope => `${scope.organizationId}:${scope.courseId}`)
      .sort(),
    acceptedCoverageStatus: 'accepted',
    acceptedCoverageFingerprint: recovery.binding.acceptedFailedCoverage.fingerprint,
    verificationFingerprint: calculateReindexVerificationFingerprint(recovery.plan),
    status: 'running',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    concurrency: 2,
    jobTimeoutMs: 7_200_000,
    counts: {
      eligible: rows.length + 6,
      recoverable: rows.length,
      auditedFailed: 6,
      unresolvedMissing: 0,
      unresolvedInvalid: 0,
      expectedDocuments: rows.length,
      planned: rows.length,
      accepted: 0,
      completed: 0,
      failed: 0,
      pending: rows.length,
      alreadyEnqueued: 0,
      missingSource: 4,
      invalidSourcePath: 2,
      unsupported: 0,
      gaps: 0,
    },
    plannedJobIds,
    acceptedJobIds: [],
    completedJobIds: [],
    failures: [],
    gaps: [],
  };
  Object.assign(ledger, overrides);
  if (!Object.prototype.hasOwnProperty.call(overrides, 'counts')) {
    const completed = new Set<string>(ledger.completedJobIds as string[]);
    const failures = new Set<string>(
      (ledger.failures as Array<{ jobId: string }>).map(failure => failure.jobId)
    );
    ledger.counts = {
      ...ledger.counts,
      planned: ledger.plannedJobIds.length,
      accepted: ledger.acceptedJobIds.length,
      completed: ledger.completedJobIds.length,
      failed: ledger.failures.length,
      pending: ledger.plannedJobIds.filter(
        (jobId: string) => !completed.has(jobId) && !failures.has(jobId)
      ).length,
    };
  }
  return ledger;
}

export function completedExecutionLedger(rows: ReindexSourceRow[]): Record<string, unknown> {
  const jobIds = rows.map(row => buildReindexJobId(RUN_ID, row.id));
  return executionLedger(rows, {
    status: 'completed',
    acceptedJobIds: jobIds,
    completedJobIds: jobIds,
    counts: {
      ...(executionLedger(rows).counts as Record<string, number>),
      accepted: jobIds.length,
      completed: jobIds.length,
      pending: 0,
    },
  });
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
