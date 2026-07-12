import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DocumentProcessingJobDataSchema,
  JobType,
  type DocumentProcessingJobData,
} from '@megacampus/shared-types';
import {
  buildReindexJobId,
  createReindexQueueAdapter,
  createSourceDatabase,
  loadIndexedDocumentIdentities,
  loadExecutionArtifact,
  loadReindexFixtureDependencies,
  parseReindexCliArgs,
  persistExecutionArtifact,
  probeSourceFiles,
  ReindexJobTimeoutError,
  runReindexCli,
  runReindexCommand,
  selectRelevanceFixtures,
  validatePhysicalCollectionTarget,
  type ReindexCommandDependencies,
  type ReindexCommandOptions,
} from '../../../../tools/qdrant/reindex-course-embeddings';
import {
  buildReindexPlan,
  calculateReindexVerificationFingerprint,
  loadReindexSources,
  type RecoveryReindexBinding,
  type IndexedDocumentIdentity,
  type ReindexRelevanceCheck,
  type ReindexSourceRow,
} from '../../../../tools/qdrant/reindex-plan';
import {
  calculateRecoveryManifestSha256,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from '../../../../tools/qdrant/source-recovery-manifest';

const RUN_ID = '50000000-0000-4000-8000-000000000005';
const TARGET = 'course_embeddings_v2';

function source(id: string, locale: 'ru' | 'en' = 'ru'): ReindexSourceRow {
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

function recoveryFixture(
  rows: readonly ReindexSourceRow[],
  phase: 'verified' | 'reindex_started' = 'verified'
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
    revision: phase === 'verified' ? 12 : 13,
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
    verifiedFailedCoverageFileIds: auditedRows.map(row => row.id),
  };
  const allRows = [...rows, ...auditedRows];
  const invalidIds = new Set(auditedRows.slice(4).map(row => row.id));
  const plan = buildReindexPlan(
    allRows,
    row => (invalidIds.has(row.id) ? 'invalid_source_path' : rows.includes(row)),
    binding
  );
  return { rows: allRows, binding, plan };
}

function indexed(row: ReindexSourceRow): IndexedDocumentIdentity {
  return {
    documentId: row.id,
    courseId: row.courseId!,
    organizationId: row.organizationId,
    pointCount: row.chunkCount ?? 0,
  };
}

function dependencies(
  rows: ReindexSourceRow[],
  overrides: Partial<ReindexCommandDependencies> = {}
): ReindexCommandDependencies {
  const recovery = recoveryFixture(rows);
  const auditedIds = new Set(recovery.binding.verifiedFailedCoverageFileIds);
  const invalidIds = new Set(recovery.binding.verifiedFailedCoverageFileIds.slice(4));
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
    loadRecoveryBinding: vi.fn().mockResolvedValue(recovery.binding),
    persistRecoveryJournalTransition: vi.fn(({ next }) => Promise.resolve(next)),
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

function executionLedger(
  rows: ReindexSourceRow[],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const recovery = recoveryFixture(rows, 'reindex_started');
  const plannedJobIds = rows.map(row => buildReindexJobId(RUN_ID, row.id));
  return {
    schemaVersion: 3,
    mode: 'execute',
    runId: RUN_ID,
    targetCollection: TARGET,
    recoveryRunId: recovery.binding.manifest.run_id,
    recoveryManifestSha256: recovery.binding.manifestSha256,
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
    ...overrides,
  };
}

function deferred<T>(): {
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

describe('BullMQ reindex queue adapter', () => {
  it('returns after acceptance and exposes injected terminal completion separately', async () => {
    const completion = deferred<void>();
    const waitForJob = vi.fn(() => completion.promise);
    const job = {
      id: 'job-1',
      data: { fileId: 'file-1' },
      getState: vi.fn().mockResolvedValue('waiting'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = createReindexQueueAdapter({
      getJob: vi.fn().mockResolvedValue(null),
      addJob: vi.fn().mockResolvedValue(job),
      waitForJob,
    });

    const handle = await adapter.enqueueJob('job-1', {} as DocumentProcessingJobData);
    expect(waitForJob).not.toHaveBeenCalled();

    const terminal = handle.waitForTerminal(1234);
    expect(waitForJob).toHaveBeenCalledWith(job, 1234);
    completion.resolve();
    await expect(terminal).resolves.toBeUndefined();
  });
});

describe('durable reindex ledger', () => {
  it('round-trips a validated mode-0600 target-bound manifest', async () => {
    const directory = await mkdtemp('/tmp/mc2-qdrant-ledger-');
    const artifactPath = join(directory, 'ledger.json');
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const ledger = executionLedger(rows);

    try {
      await persistExecutionArtifact(ledger as never, artifactPath);

      await expect(loadExecutionArtifact(artifactPath)).resolves.toEqual(ledger);
      expect((await stat(artifactPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('Qdrant reindex command', () => {
  it.each([
    [{ mode: 'plan' }],
    [{ mode: 'execute', targetCollection: TARGET }],
    [{ mode: 'verify', targetCollection: TARGET }],
  ] as const)('fails closed when %s has no recovery binding', async options => {
    const deps = dependencies([source('60000000-0000-4000-8000-000000000006')], {
      loadRecoveryBinding: vi.fn().mockResolvedValue(null),
    });

    await expect(runReindexCommand(options, deps)).rejects.toThrow(/recovery binding/iu);
    expect(deps.enqueueJob).not.toHaveBeenCalled();
    expect(deps.loadIndexedDocuments).not.toHaveBeenCalled();
  });

  it('batches relevance fixture text lookup beyond 1000 source IDs', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      source(
        `00000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
        index === 1000 ? 'en' : 'ru'
      )
    );
    const russianId = rows[999].id;
    const englishId = rows[1000].id;
    const loadMarkdown = vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        ids.flatMap(id => {
          if (id === russianId) {
            return [{ id, markdown: 'Достаточно длинный русский запрос для проверки поиска' }];
          }
          if (id === englishId) {
            return [{ id, markdown: 'A sufficiently long English relevance query fixture' }];
          }
          return [];
        })
      )
    );

    const fixtures = await selectRelevanceFixtures(rows, loadMarkdown);

    expect(fixtures.map(fixture => [fixture.language, fixture.source.id])).toEqual([
      ['ru', russianId],
      ['en', englishId],
    ]);
    expect(loadMarkdown.mock.calls.every(([ids]) => ids.length <= 200)).toBe(true);
    expect(loadMarkdown).toHaveBeenCalledTimes(6);
  });

  it('feeds every paged source beyond 1000 into plan, execute, and verify', async () => {
    const databaseFiles = Array.from({ length: 1001 }, (_, index) => {
      const suffix = String(index).padStart(12, '0');
      return {
        id: `00000000-0000-4000-8000-${suffix}`,
        organization_id: '10000000-0000-4000-8000-000000000001',
        course_id: '20000000-0000-4000-8000-000000000002',
        storage_path: `uploads/org/course/source-${suffix}.pdf`,
        mime_type: 'application/pdf',
        priority: 'CORE',
        hash: 'a'.repeat(64),
        vector_status: 'indexed',
        error_message: null,
        chunk_count: 1,
      };
    });
    const database = {
      countFileCatalogSources: vi.fn().mockResolvedValue(databaseFiles.length),
      listFileCatalogSourcesPage: vi.fn(
        ({ afterId, limit }: { afterId?: string; limit: number }) => {
          const start = afterId ? databaseFiles.findIndex(file => file.id === afterId) + 1 : 0;
          return Promise.resolve(databaseFiles.slice(start, start + limit));
        }
      ),
      listCourseSources: vi.fn().mockResolvedValue([
        {
          id: '20000000-0000-4000-8000-000000000002',
          organization_id: '10000000-0000-4000-8000-000000000001',
          user_id: '30000000-0000-4000-8000-000000000003',
          language: 'ru',
        },
      ]),
    };
    const rows = await loadReindexSources(database);
    const recovery = recoveryFixture(rows);
    const resumed = recoveryFixture(rows, 'reindex_started');
    const auditedRows = recovery.rows.slice(rows.length);
    const loadAllSources = async () => [...(await loadReindexSources(database)), ...auditedRows];
    const recordedJobIds = rows.slice(0, -1).map(row => buildReindexJobId(RUN_ID, row.id));
    const planDeps = dependencies(rows, {
      loadSources: loadAllSources,
    });
    const executeDeps = dependencies(rows, {
      loadSources: loadAllSources,
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(
        executionLedger(rows, {
          status: 'completed',
          acceptedJobIds: recordedJobIds,
          completedJobIds: recordedJobIds,
        })
      ),
      loadIndexedDocuments: vi.fn().mockResolvedValue(rows.map(indexed)),
    });
    const verifyDeps = dependencies(rows, {
      loadSources: loadAllSources,
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(executionLedger(rows)),
      loadIndexedDocuments: vi.fn().mockResolvedValue(rows.map(indexed)),
    });

    const plan = await runReindexCommand({ mode: 'plan' }, planDeps);
    expect(plan.report).toMatchObject({ recoverable: 1001, expectedDocuments: 1001 });

    const execute = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        artifactPath: '/tmp/q7-1001-ledger.json',
      },
      executeDeps
    );
    expect(executeDeps.inspectJobs).toHaveBeenCalledWith(
      expect.arrayContaining(rows.map(row => buildReindexJobId(RUN_ID, row.id)))
    );
    expect(executeDeps.enqueueJob).toHaveBeenCalledOnce();
    expect(execute.report).toMatchObject({ alreadyEnqueued: 1000, enqueued: 1 });

    const verify = await runReindexCommand(
      { mode: 'verify', targetCollection: TARGET, runId: RUN_ID },
      verifyDeps
    );
    expect(verify.exitCode).toBe(0);
    expect(verify.report).toMatchObject({
      expectedDocuments: 1001,
      indexedDocuments: 1001,
      expectedKnownPoints: 1001,
      indexedPoints: 1001,
    });
    expect(database.listFileCatalogSourcesPage.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('rejects absolute, traversal, and symlink-escape source paths before reads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mc2-qdrant-source-root-'));
    const uploadDirectory = join(directory, 'uploads', 'org');
    const safePath = join(uploadDirectory, 'safe.pdf');
    const outsidePath = join(directory, 'outside.pdf');
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(safePath, 'safe');
    await writeFile(outsidePath, 'outside');
    await symlink(outsidePath, join(uploadDirectory, 'escape.pdf'));
    const previousBasePath = process.env.DOCLING_UPLOADS_BASE_PATH;
    process.env.DOCLING_UPLOADS_BASE_PATH = directory;

    try {
      const safe = source('61000000-0000-4000-8000-000000000006');
      safe.storagePath = 'uploads/org/safe.pdf';
      const absolute = source('62000000-0000-4000-8000-000000000006');
      absolute.storagePath = safePath;
      const traversal = source('63000000-0000-4000-8000-000000000006');
      traversal.storagePath = 'uploads/org/../org/safe.pdf';
      const symlinkEscape = source('64000000-0000-4000-8000-000000000006');
      symlinkEscape.storagePath = 'uploads/org/escape.pdf';
      const missing = source('65000000-0000-4000-8000-000000000006');
      missing.storagePath = 'uploads/org/missing.pdf';

      await expect(
        probeSourceFiles([safe, absolute, traversal, symlinkEscape, missing])
      ).resolves.toEqual({
        availableFileIds: new Set([safe.id]),
        invalidPathFileIds: new Set([absolute.id, traversal.id, symlinkEscape.id]),
        resolvedFilePaths: new Map([[safe.id, safePath]]),
      });
    } finally {
      if (previousBasePath === undefined) delete process.env.DOCLING_UPLOADS_BASE_PATH;
      else process.env.DOCLING_UPLOADS_BASE_PATH = previousBasePath;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('builds exact-count and ordered keyset Supabase source queries', async () => {
    const countQuery: Record<string, unknown> = {};
    const pageQuery: Record<string, unknown> = {};
    const courseQuery: Record<string, unknown> = {};
    const makeThenable = (
      query: Record<string, unknown>,
      response: Record<string, unknown>
    ): Record<string, unknown> => {
      Object.assign(query, {
        eq: vi.fn(() => query),
        gt: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        in: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(response).then(resolve, reject),
      });
      return query;
    };
    makeThenable(countQuery, { data: null, count: 1205, error: null });
    makeThenable(pageQuery, { data: [], count: null, error: null });
    makeThenable(courseQuery, { data: [], count: null, error: null });
    const select = vi.fn((columns: string, options?: { head?: boolean }) => {
      if (options?.head) return countQuery;
      return columns === 'id, organization_id, user_id, language' ? courseQuery : pageQuery;
    });
    const database = createSourceDatabase({
      from: vi.fn(() => ({ select })),
    } as never);

    await expect(database.countFileCatalogSources('course-1')).resolves.toBe(1205);
    await database.listFileCatalogSourcesPage({
      courseId: 'course-1',
      afterId: 'file-0499',
      limit: 500,
    });
    await database.listCourseSources(['course-1', 'course-2']);

    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(countQuery.eq).toHaveBeenCalledWith('course_id', 'course-1');
    expect(pageQuery.eq).toHaveBeenCalledWith('course_id', 'course-1');
    expect(pageQuery.gt).toHaveBeenCalledWith('id', 'file-0499');
    expect(pageQuery.order).toHaveBeenCalledWith('id');
    expect(pageQuery.limit).toHaveBeenCalledWith(500);
    expect(courseQuery.in).toHaveBeenCalledWith('id', ['course-1', 'course-2']);
    expect(courseQuery.order).toHaveBeenCalledWith('id');
  });

  it('counts every indexed point per document across Qdrant scroll pages', async () => {
    const row = source('60000000-0000-4000-8000-000000000006');
    const scroll = vi
      .fn()
      .mockResolvedValueOnce({
        points: [
          {
            payload: {
              document_id: row.id,
              course_id: row.courseId,
              organization_id: row.organizationId,
            },
          },
          {
            payload: {
              document_id: row.id,
              course_id: row.courseId,
              organization_id: row.organizationId,
            },
          },
        ],
        next_page_offset: 'next',
      })
      .mockResolvedValueOnce({
        points: [
          {
            payload: {
              document_id: row.id,
              course_id: row.courseId,
              organization_id: row.organizationId,
            },
          },
        ],
        next_page_offset: null,
      });

    await expect(
      loadIndexedDocumentIdentities(TARGET, undefined, { scroll } as never)
    ).resolves.toEqual([{ ...indexed(row), pointCount: 3 }]);
  });

  it('keeps plan mode structurally read-only and returns 2 for every unresolved gap', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const deps = dependencies(rows, {
      probeSources: vi.fn().mockResolvedValue({
        availableFileIds: new Set(),
        invalidPathFileIds: new Set(),
        resolvedFilePaths: new Map(),
      }),
    });
    const baseOptions: ReindexCommandOptions = { mode: 'plan' };

    const blocked = await runReindexCommand(baseOptions, deps);

    expect(blocked.exitCode).toBe(2);
    expect(deps.verifyPhysicalTarget).not.toHaveBeenCalled();
    expect(deps.enqueueJob).not.toHaveBeenCalled();
    expect(deps.persistArtifact).not.toHaveBeenCalled();
    expect(deps.loadIndexedDocuments).not.toHaveBeenCalled();
    expect(deps.runRelevanceChecks).not.toHaveBeenCalled();
  });

  it('rejects reindex_started plan state without the matching durable ledger', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const resumed = recoveryFixture(rows, 'reindex_started');
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
    });

    await expect(runReindexCommand({ mode: 'plan' }, deps)).rejects.toThrow(
      /reindex_started|artifact|ledger|recovery journal/iu
    );
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('blocks execute before journal transition or enqueue when an eligible gap is unresolved', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const recovery = recoveryFixture(rows);
    const invalidAuditedIds = new Set(recovery.binding.verifiedFailedCoverageFileIds.slice(4));
    const deps = dependencies(rows, {
      probeSources: vi.fn().mockResolvedValue({
        availableFileIds: new Set([rows[0].id]),
        invalidPathFileIds: invalidAuditedIds,
        resolvedFilePaths: new Map([[rows[0].id, `/safe/uploads/${rows[0].id}.pdf`]]),
      }),
    });

    const result = await runReindexCommand(
      { mode: 'execute', targetCollection: TARGET, runId: RUN_ID },
      deps
    );

    expect(result.exitCode).toBe(2);
    expect(result.report).toMatchObject({ unresolvedMissing: 1, unresolvedInvalid: 0 });
    expect(deps.persistRecoveryJournalTransition).not.toHaveBeenCalled();
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('blocks verify before Qdrant reads when an eligible gap is unresolved', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const resumed = recoveryFixture(rows, 'reindex_started');
    const invalidAuditedIds = new Set(resumed.binding.verifiedFailedCoverageFileIds.slice(4));
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(executionLedger(rows)),
      probeSources: vi.fn().mockResolvedValue({
        availableFileIds: new Set([rows[0].id]),
        invalidPathFileIds: invalidAuditedIds,
        resolvedFilePaths: new Map([[rows[0].id, `/safe/uploads/${rows[0].id}.pdf`]]),
      }),
    });

    const result = await runReindexCommand(
      { mode: 'verify', targetCollection: TARGET, runId: RUN_ID },
      deps
    );

    expect(result.exitCode).toBe(2);
    expect(deps.loadIndexedDocuments).not.toHaveBeenCalled();
    expect(deps.runRelevanceChecks).not.toHaveBeenCalled();
  });

  it('refuses the logical alias before reading sources or verifying schema', async () => {
    const deps = dependencies([]);

    await expect(
      runReindexCommand({ mode: 'execute', targetCollection: 'course_embeddings' }, deps)
    ).rejects.toThrow('physical collection');

    expect(deps.loadSources).not.toHaveBeenCalled();
    expect(deps.verifyPhysicalTarget).not.toHaveBeenCalled();
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('refuses an invalid explicit run UUID before reading sources', async () => {
    const deps = dependencies([]);

    await expect(
      runReindexCommand(
        {
          mode: 'execute',
          targetCollection: TARGET,
          runId: 'not-a-uuid',
        },
        deps
      )
    ).rejects.toThrow('run-id');

    expect(deps.loadSources).not.toHaveBeenCalled();
    expect(deps.verifyPhysicalTarget).not.toHaveBeenCalled();
  });

  it('uses deterministic run/file jobs and bounds terminal Stage 2 work to concurrency 2', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
      source('80000000-0000-4000-8000-000000000008'),
    ];
    let active = 0;
    let maxActive = 0;
    const enqueued: Array<{ jobId: string; data: DocumentProcessingJobData }> = [];
    const enqueueJob = vi.fn((jobId: string, data: DocumentProcessingJobData) => {
      enqueued.push({ jobId, data });
      return Promise.resolve({
        waitForTerminal: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise(resolve => setTimeout(resolve, 5));
          active -= 1;
        },
      });
    });
    const order: string[] = [];
    const deps = dependencies(rows, {
      verifyPhysicalTarget: vi.fn(() => {
        order.push('verify');
        return Promise.resolve({ ok: true, mismatches: [] });
      }),
      enqueueJob: vi.fn((jobId: string, data: DocumentProcessingJobData) => {
        order.push('enqueue');
        return enqueueJob(jobId, data);
      }),
      persistRecoveryJournalTransition: vi.fn(({ next }) => {
        order.push('persist-reindex-started');
        return Promise.resolve(next);
      }),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
      },
      deps
    );

    expect(result.exitCode).toBe(0);
    expect(order.indexOf('persist-reindex-started')).toBeGreaterThan(order.indexOf('verify'));
    expect(order.indexOf('persist-reindex-started')).toBeLessThan(order.indexOf('enqueue'));
    expect(deps.persistRecoveryJournalTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 12,
        next: expect.objectContaining({ phase: 'reindex_started', revision: 13 }),
      })
    );
    expect(maxActive).toBe(2);
    expect(enqueued).toHaveLength(3);
    expect(enqueued[0]).toEqual({
      jobId: buildReindexJobId(RUN_ID, rows[0].id),
      data: expect.objectContaining({
        jobType: JobType.DOCUMENT_PROCESSING,
        fileId: rows[0].id,
        qdrantTargetCollection: TARGET,
        qdrantReindexRunId: RUN_ID,
      }),
    });
    expect(deps.persistArtifact).toHaveBeenCalled();
    const artifact = vi.mocked(deps.persistArtifact).mock.calls.at(-1)![0];
    expect(artifact).toMatchObject({
      schemaVersion: 3,
      mode: 'execute',
      runId: RUN_ID,
      targetCollection: TARGET,
      recoveryRunId: '51000000-0000-4000-8000-000000000005',
      recoveryManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      verificationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      status: 'completed',
      concurrency: 2,
      counts: { accepted: 3, completed: 3, failed: 0, pending: 0, gaps: 0 },
      acceptedJobIds: enqueued.map(job => job.jobId),
      completedJobIds: enqueued.map(job => job.jobId),
    });
    expect(JSON.stringify(artifact)).not.toContain('storagePath');
    expect(JSON.stringify(artifact)).not.toContain('/uploads/');
  });

  it('checkpoints run identity and partial enqueue failure before returning a resumable error', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
      source('80000000-0000-4000-8000-000000000008'),
    ];
    const persisted: Array<Record<string, unknown>> = [];
    const enqueueJob = vi
      .fn()
      .mockResolvedValueOnce({ waitForTerminal: () => Promise.resolve() })
      .mockRejectedValueOnce(new Error('redis unavailable'));
    const deps = dependencies(rows, {
      enqueueJob,
      persistArtifact: vi.fn((artifact: Record<string, unknown>) => {
        persisted.push(structuredClone(artifact));
        return Promise.resolve();
      }),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        concurrency: 1,
        jobTimeoutMs: 1000,
        artifactPath: '/tmp/q7-partial-ledger.json',
      },
      deps
    );

    expect(result.exitCode).toBe(1);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(persisted[0]).toMatchObject({
      runId: RUN_ID,
      targetCollection: TARGET,
      status: 'planned',
      acceptedJobIds: [],
      failures: [],
    });
    expect(persisted.at(-1)).toMatchObject({
      status: 'failed',
      acceptedJobIds: [buildReindexJobId(RUN_ID, rows[0].id)],
      completedJobIds: [buildReindexJobId(RUN_ID, rows[0].id)],
      failures: [
        {
          jobId: buildReindexJobId(RUN_ID, rows[1].id),
          fileId: rows[1].id,
          phase: 'enqueue',
        },
      ],
      counts: { accepted: 1, completed: 1, failed: 1, pending: 1 },
    });
    expect(result.report).toMatchObject({
      ok: false,
      runId: RUN_ID,
      artifactPath: '/tmp/q7-partial-ledger.json',
    });
    expect(JSON.stringify(persisted)).not.toContain('redis unavailable');
  });

  it('uses the target-bound ledger after BullMQ retention removes accepted jobs', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const retainedJobId = buildReindexJobId(RUN_ID, rows[0].id);
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi
        .fn()
        .mockResolvedValue(recoveryFixture(rows, 'reindex_started').binding),
      loadArtifact: vi.fn().mockResolvedValue(
        executionLedger(rows, {
          status: 'completed',
          acceptedJobIds: [retainedJobId],
          completedJobIds: [retainedJobId],
        })
      ),
      inspectJobs: vi.fn().mockResolvedValue([]),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        artifactPath: '/tmp/q7-retained-ledger.json',
      },
      deps
    );

    expect(deps.enqueueJob).toHaveBeenCalledOnce();
    expect(deps.enqueueJob).toHaveBeenCalledWith(
      buildReindexJobId(RUN_ID, rows[1].id),
      expect.objectContaining({ fileId: rows[1].id })
    );
    expect(result.report).toMatchObject({ alreadyEnqueued: 1, enqueued: 1 });
  });

  it('retries accepted-only jobs missing from BullMQ and keeps them pending until terminal', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const jobId = buildReindexJobId(RUN_ID, rows[0].id);
    const persisted: Array<Record<string, unknown>> = [];
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi
        .fn()
        .mockResolvedValue(recoveryFixture(rows, 'reindex_started').binding),
      loadArtifact: vi.fn().mockResolvedValue(
        executionLedger(rows, {
          status: 'running',
          acceptedJobIds: [jobId],
          completedJobIds: [],
        })
      ),
      inspectJobs: vi.fn().mockResolvedValue([]),
      persistArtifact: vi.fn((artifact: Record<string, unknown>) => {
        persisted.push(structuredClone(artifact));
        return Promise.resolve();
      }),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        artifactPath: '/tmp/q7-accepted-only.json',
      },
      deps
    );

    expect(deps.enqueueJob).toHaveBeenCalledOnce();
    const acceptedCheckpoint = persisted.find(
      artifact =>
        (artifact.acceptedJobIds as string[]).includes(jobId) &&
        !(artifact.completedJobIds as string[]).includes(jobId) &&
        (artifact as { status: string }).status === 'running'
    );
    expect(acceptedCheckpoint).toMatchObject({ counts: { pending: 1 } });
    expect(result).toMatchObject({
      exitCode: 0,
      report: { enqueued: 1, completed: 1, pending: 0 },
    });
  });

  it('rejects reusing a durable run ledger for a different physical target before source reads', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const deps = dependencies(rows, {
      loadArtifact: vi
        .fn()
        .mockResolvedValue(executionLedger(rows, { targetCollection: 'course_embeddings_v3' })),
    });

    await expect(
      runReindexCommand(
        {
          mode: 'execute',
          targetCollection: TARGET,
          runId: RUN_ID,
          artifactPath: '/tmp/q7-target-mismatch.json',
        },
        deps
      )
    ).rejects.toThrow(/target/i);

    expect(deps.loadSources).not.toHaveBeenCalled();
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('rejects a stale recovery fingerprint before resuming or enqueueing', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const resumed = recoveryFixture(rows, 'reindex_started');
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi
        .fn()
        .mockResolvedValue(executionLedger(rows, { verificationFingerprint: 'f'.repeat(64) })),
    });

    await expect(
      runReindexCommand(
        {
          mode: 'execute',
          targetCollection: TARGET,
          runId: RUN_ID,
          artifactPath: '/tmp/q7-stale-recovery-ledger.json',
        },
        deps
      )
    ).rejects.toThrow(/fingerprint|recovery binding/iu);

    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('rejects stale audited counts in a schema-v3 resume ledger', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const resumed = recoveryFixture(rows, 'reindex_started');
    const stale = executionLedger(rows) as { counts: Record<string, number> };
    stale.counts.auditedFailed = 5;
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(stale),
    });

    await expect(
      runReindexCommand({ mode: 'execute', targetCollection: TARGET, runId: RUN_ID }, deps)
    ).rejects.toThrow(/audited|counts|recovery binding/iu);
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('removes and retries a retained failed job with matching run data', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const jobId = buildReindexJobId(RUN_ID, rows[0].id);
    const deps = dependencies(rows, {
      inspectJobs: vi.fn().mockResolvedValue([
        {
          jobId,
          state: 'failed',
          data: DocumentProcessingJobDataSchema.parse({
            jobType: JobType.DOCUMENT_PROCESSING,
            organizationId: rows[0].organizationId,
            courseId: rows[0].courseId,
            userId: rows[0].userId,
            fileId: rows[0].id,
            filePath: '/tmp/source.pdf',
            mimeType: rows[0].mimeType,
            createdAt: '2026-07-10T12:00:00.000Z',
            qdrantTargetCollection: TARGET,
            qdrantReindexRunId: RUN_ID,
          }),
        },
      ]),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
      },
      deps
    );

    expect(result.exitCode).toBe(0);
    expect(deps.removeJob).toHaveBeenCalledWith(jobId);
    expect(deps.enqueueJob).toHaveBeenCalledWith(
      jobId,
      expect.objectContaining({ fileId: rows[0].id })
    );
  });

  it('checkpoints a bounded terminal timeout without serializing the raw error', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const persisted: Array<Record<string, unknown>> = [];
    const jobId = buildReindexJobId(RUN_ID, rows[0].id);
    const deps = dependencies(rows, {
      enqueueJob: vi.fn().mockResolvedValue({
        waitForTerminal: vi.fn().mockRejectedValue(new ReindexJobTimeoutError(jobId, 1000)),
      }),
      persistArtifact: vi.fn((artifact: Record<string, unknown>) => {
        persisted.push(structuredClone(artifact));
        return Promise.resolve();
      }),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        jobTimeoutMs: 1000,
      },
      deps
    );

    expect(result.exitCode).toBe(1);
    expect(persisted.at(-1)).toMatchObject({
      status: 'failed',
      failures: [{ jobId, fileId: rows[0].id, phase: 'timeout' }],
    });
    expect(JSON.stringify(persisted)).not.toContain('did not reach a terminal state');
  });

  it('never downgrades a failed manifest when concurrent in-flight work completes later', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const failedCheckpoint = deferred<void>();
    const persisted: Array<Record<string, unknown>> = [];
    const deps = dependencies(rows, {
      enqueueJob: vi.fn((_jobId: string, data: DocumentProcessingJobData) =>
        Promise.resolve({
          waitForTerminal: async () => {
            if (data.fileId === rows[0].id) throw new Error('worker failed');
            await failedCheckpoint.promise;
          },
        })
      ),
      persistArtifact: vi.fn((artifact: Record<string, unknown>) => {
        const snapshot = structuredClone(artifact);
        persisted.push(snapshot);
        if (snapshot.status === 'failed') failedCheckpoint.resolve();
        return Promise.resolve();
      }),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        concurrency: 2,
      },
      deps
    );

    expect(result.exitCode).toBe(1);
    const firstFailure = persisted.findIndex(artifact => artifact.status === 'failed');
    expect(firstFailure).toBeGreaterThanOrEqual(0);
    expect(persisted.slice(firstFailure).map(artifact => artifact.status)).toEqual(
      expect.arrayContaining(['failed'])
    );
    expect(persisted.slice(firstFailure).every(artifact => artifact.status === 'failed')).toBe(
      true
    );
  });

  it('validates and skips a retained completed job from the same run and target', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const existingJobId = buildReindexJobId(RUN_ID, rows[0].id);
    const deps = dependencies(rows, {
      inspectJobs: vi.fn().mockResolvedValue([
        {
          jobId: existingJobId,
          state: 'completed',
          data: DocumentProcessingJobDataSchema.parse({
            jobType: JobType.DOCUMENT_PROCESSING,
            organizationId: rows[0].organizationId,
            courseId: rows[0].courseId,
            userId: rows[0].userId,
            fileId: rows[0].id,
            filePath: '/tmp/source.pdf',
            mimeType: rows[0].mimeType,
            createdAt: '2026-07-10T12:00:00.000Z',
            qdrantTargetCollection: TARGET,
            qdrantReindexRunId: RUN_ID,
          }),
        },
      ]),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
      },
      deps
    );

    expect(deps.enqueueJob).toHaveBeenCalledOnce();
    expect(deps.enqueueJob).toHaveBeenCalledWith(
      buildReindexJobId(RUN_ID, rows[1].id),
      expect.objectContaining({ fileId: rows[1].id })
    );
    expect(result.report).toMatchObject({ enqueued: 1, alreadyEnqueued: 1 });
  });

  it('returns nonzero when verify finds parity, schema, or relevance failures', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006', 'ru'),
      source('70000000-0000-4000-8000-000000000007', 'en'),
    ];
    const resumed = recoveryFixture(rows, 'reindex_started');
    const deps = dependencies(rows, {
      loadRecoveryBinding: vi.fn().mockResolvedValue(resumed.binding),
      loadArtifact: vi.fn().mockResolvedValue(executionLedger(rows)),
      verifyPhysicalTarget: vi
        .fn()
        .mockResolvedValue({ ok: false, mismatches: ['payload_schema.course_id'] }),
      loadIndexedDocuments: vi.fn().mockResolvedValue([indexed(rows[0])]),
      runRelevanceChecks: vi.fn().mockResolvedValue([
        { language: 'ru', passed: true, nativeHybrid: true },
        { language: 'en', passed: false, nativeHybrid: true },
      ]),
    });

    const result = await runReindexCommand(
      { mode: 'verify', targetCollection: TARGET, runId: RUN_ID },
      deps
    );

    expect(result.exitCode).toBe(1);
    expect(result.report).toMatchObject({
      ok: false,
      missingDocumentIds: [rows[1].id],
      schemaMismatches: ['payload_schema.course_id'],
      relevanceFailures: ['en'],
    });
    expect(deps.enqueueJob).not.toHaveBeenCalled();
    expect(deps.persistArtifact).not.toHaveBeenCalled();
  });
});

describe('physical target validation', () => {
  it('accepts only a non-alias bounded physical collection name', () => {
    expect(validatePhysicalCollectionTarget(TARGET)).toBe(TARGET);
    expect(() => validatePhysicalCollectionTarget('course_embeddings')).toThrow(
      'physical collection'
    );
    expect(() => validatePhysicalCollectionTarget('   ')).toThrow('must not be empty');
    expect(() => validatePhysicalCollectionTarget('x'.repeat(256))).toThrow('255');
  });
});

describe('reindex CLI parsing', () => {
  it('parses bounded execute options and explicit dry fixture paths', () => {
    expect(
      parseReindexCliArgs([
        'execute',
        '--target-collection',
        TARGET,
        '--concurrency=4',
        '--course-id',
        '20000000-0000-4000-8000-000000000002',
        '--run-id',
        RUN_ID,
        '--artifact',
        '/tmp/reindex-artifact.json',
        '--fixture',
        '/tmp/reindex-fixture.json',
      ])
    ).toEqual({
      mode: 'execute',
      targetCollection: TARGET,
      concurrency: 4,
      courseId: '20000000-0000-4000-8000-000000000002',
      runId: RUN_ID,
      artifactPath: '/tmp/reindex-artifact.json',
      fixturePath: '/tmp/reindex-fixture.json',
      help: false,
    });
    expect(() => parseReindexCliArgs(['plan', '--allow-gaps'])).toThrow('Unknown option');
  });

  it('loads and validates a complete dry fixture without live services', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mc2-qdrant-reindex-'));
    const fixturePath = join(directory, 'fixture.json');
    const row = source('60000000-0000-4000-8000-000000000006');
    const recovery = recoveryFixture([row]);
    await writeFile(
      fixturePath,
      JSON.stringify({
        runId: RUN_ID,
        now: '2026-07-10T12:00:00.000Z',
        recoveryBinding: recovery.binding,
        sources: recovery.rows.map(sourceRow => ({
          ...sourceRow,
          sourceAvailable: sourceRow.id === row.id,
          invalidSourcePath: recovery.binding.verifiedFailedCoverageFileIds
            .slice(4)
            .includes(sourceRow.id),
        })),
        schemaVerification: { ok: true, mismatches: [] },
        indexedDocuments: [indexed(row)],
        relevanceChecks: [
          { language: 'ru', passed: true, nativeHybrid: true },
          { language: 'en', passed: true, nativeHybrid: true },
        ],
      })
    );

    try {
      const deps = await loadReindexFixtureDependencies(fixturePath);
      const result = await runReindexCommand({ mode: 'plan' }, deps);
      expect(result.exitCode).toBe(0);
      expect(result.report).toMatchObject({ recoverable: 1, auditedFailed: 6 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects unknown modes and options', () => {
    expect(() => parseReindexCliArgs(['mutate'])).toThrow('mode');
    expect(() => parseReindexCliArgs(['plan', '--unsafe'])).toThrow('Unknown option');
  });

  it('routes fixture mode without constructing live dependencies or printing source paths', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const deps = dependencies(rows);
    const stdout = vi.fn();
    const stderr = vi.fn();
    const createDefaultDependencies = vi.fn();
    const loadFixtureDependencies = vi.fn().mockResolvedValue(deps);

    const exitCode = await runReindexCli(['plan', '--fixture', '/tmp/reindex-fixture.json'], {
      stdout,
      stderr,
      createDefaultDependencies,
      loadFixtureDependencies,
    });

    expect(exitCode).toBe(0);
    expect(loadFixtureDependencies).toHaveBeenCalledWith('/tmp/reindex-fixture.json');
    expect(createDefaultDependencies).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledOnce();
    const output = stdout.mock.calls[0][0] as string;
    const summary = stderr.mock.calls[0][0] as string;
    expect(output).toContain('"dryFixture": true');
    expect(output).not.toContain('storagePath');
    expect(output).not.toContain('/uploads/');
    expect(summary).toMatch(
      /^PLAN status=ok eligible=7 recoverable=1 audited_failed=6 unresolved=0 action=none\n$/
    );
    expect(summary).not.toContain('/uploads/');
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });

  it('reports an unresolved execute as blocked without undefined or sensitive fields', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const recovery = recoveryFixture(rows);
    const deps = dependencies(rows, {
      probeSources: vi.fn().mockResolvedValue({
        availableFileIds: new Set([rows[0].id]),
        invalidPathFileIds: new Set(recovery.binding.verifiedFailedCoverageFileIds.slice(4)),
        resolvedFilePaths: new Map([[rows[0].id, `/safe/uploads/${rows[0].id}.pdf`]]),
      }),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runReindexCli(
      ['execute', '--target-collection', TARGET, '--run-id', RUN_ID],
      {
        stdout,
        stderr,
        createDefaultDependencies: () => deps,
        loadFixtureDependencies: vi.fn(),
      }
    );

    expect(exitCode).toBe(2);
    expect(stderr).toHaveBeenCalledWith(
      'EXECUTE status=blocked eligible=8 audited_failed=6 unresolved=1 action=repair-sources\n'
    );
    expect(stderr.mock.calls[0][0]).not.toContain('undefined');
    expect(stdout.mock.calls[0][0]).not.toContain('/safe/uploads/');
    expect(stdout.mock.calls[0][0]).not.toContain(rows[0].id);
    expect(stdout.mock.calls[0][0]).not.toContain(rows[1].id);
    expect(stdout.mock.calls[0][0]).not.toContain(recovery.binding.manifestSha256);
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });
});
