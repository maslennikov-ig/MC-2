import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobType, type DocumentProcessingJobData } from '@megacampus/shared-types';
import {
  buildReindexJobId,
  loadReindexFixtureDependencies,
  parseReindexCliArgs,
  runReindexCli,
  runReindexCommand,
  validatePhysicalCollectionTarget,
  type ReindexCommandDependencies,
  type ReindexCommandOptions,
} from '../../../../tools/qdrant/reindex-course-embeddings';
import type {
  IndexedDocumentIdentity,
  ReindexRelevanceCheck,
  ReindexSourceRow,
} from '../../../../tools/qdrant/reindex-plan';

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
    vectorStatus: 'indexed',
    chunkCount: 3,
    locale,
    alreadyEnqueued: false,
  };
}

function indexed(row: ReindexSourceRow): IndexedDocumentIdentity {
  return {
    documentId: row.id,
    courseId: row.courseId!,
    organizationId: row.organizationId,
  };
}

function dependencies(
  rows: ReindexSourceRow[],
  overrides: Partial<ReindexCommandDependencies> = {}
): ReindexCommandDependencies {
  const relevanceChecks: ReindexRelevanceCheck[] = [
    { language: 'ru', passed: true, nativeHybrid: true },
    { language: 'en', passed: true, nativeHybrid: true },
  ];
  return {
    loadSources: vi.fn().mockResolvedValue(rows),
    probeSources: vi.fn().mockResolvedValue(new Set(rows.map(row => row.id))),
    findExistingJobs: vi.fn().mockResolvedValue(new Set()),
    verifyPhysicalTarget: vi.fn().mockResolvedValue({ ok: true, mismatches: [] }),
    enqueueJob: vi.fn().mockResolvedValue(undefined),
    persistArtifact: vi.fn().mockResolvedValue(undefined),
    loadIndexedDocuments: vi.fn().mockResolvedValue(rows.map(indexed)),
    runRelevanceChecks: vi.fn().mockResolvedValue(relevanceChecks),
    now: () => new Date('2026-07-10T12:00:00.000Z'),
    createRunId: () => RUN_ID,
    ...overrides,
  };
}

describe('Qdrant reindex command', () => {
  it('keeps plan mode structurally read-only and allow-gaps changes only exit status', async () => {
    const rows = [source('60000000-0000-4000-8000-000000000006')];
    const deps = dependencies(rows, {
      probeSources: vi.fn().mockResolvedValue(new Set()),
    });
    const baseOptions: ReindexCommandOptions = { mode: 'plan', allowGaps: false };

    const blocked = await runReindexCommand(baseOptions, deps);
    const allowed = await runReindexCommand({ ...baseOptions, allowGaps: true }, deps);

    expect(blocked.exitCode).toBe(2);
    expect(allowed.exitCode).toBe(0);
    expect(blocked.report).toEqual(allowed.report);
    expect(deps.verifyPhysicalTarget).not.toHaveBeenCalled();
    expect(deps.enqueueJob).not.toHaveBeenCalled();
    expect(deps.persistArtifact).not.toHaveBeenCalled();
    expect(deps.loadIndexedDocuments).not.toHaveBeenCalled();
    expect(deps.runRelevanceChecks).not.toHaveBeenCalled();
  });

  it('refuses the logical alias before reading sources or verifying schema', async () => {
    const deps = dependencies([]);

    await expect(
      runReindexCommand(
        { mode: 'execute', targetCollection: 'course_embeddings', allowGaps: false },
        deps
      )
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
          allowGaps: false,
        },
        deps
      )
    ).rejects.toThrow('run-id');

    expect(deps.loadSources).not.toHaveBeenCalled();
    expect(deps.verifyPhysicalTarget).not.toHaveBeenCalled();
  });

  it('uses deterministic run/file jobs, default concurrency 2, and a sanitized artifact', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
      source('80000000-0000-4000-8000-000000000008'),
    ];
    let active = 0;
    let maxActive = 0;
    const enqueued: Array<{ jobId: string; data: DocumentProcessingJobData }> = [];
    const enqueueJob = vi.fn(async (jobId: string, data: DocumentProcessingJobData) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      enqueued.push({ jobId, data });
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
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
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        allowGaps: false,
      },
      deps
    );

    expect(result.exitCode).toBe(0);
    expect(order[0]).toBe('verify');
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
    expect(deps.persistArtifact).toHaveBeenCalledOnce();
    const artifact = vi.mocked(deps.persistArtifact).mock.calls[0][0];
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      mode: 'execute',
      runId: RUN_ID,
      targetCollection: TARGET,
      concurrency: 2,
      counts: { enqueued: 3, alreadyEnqueued: 0, gaps: 0 },
    });
    expect(JSON.stringify(artifact)).not.toContain('storagePath');
    expect(JSON.stringify(artifact)).not.toContain('/uploads/');
  });

  it('makes a same-run rerun idempotent by skipping existing deterministic jobs', async () => {
    const rows = [
      source('60000000-0000-4000-8000-000000000006'),
      source('70000000-0000-4000-8000-000000000007'),
    ];
    const existingJobId = buildReindexJobId(RUN_ID, rows[0].id);
    const deps = dependencies(rows, {
      findExistingJobs: vi.fn().mockResolvedValue(new Set([existingJobId])),
    });

    const result = await runReindexCommand(
      {
        mode: 'execute',
        targetCollection: TARGET,
        runId: RUN_ID,
        allowGaps: false,
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
    const deps = dependencies(rows, {
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
      { mode: 'verify', targetCollection: TARGET, allowGaps: false },
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
        '--allow-gaps',
      ])
    ).toEqual({
      mode: 'execute',
      targetCollection: TARGET,
      concurrency: 4,
      courseId: '20000000-0000-4000-8000-000000000002',
      runId: RUN_ID,
      artifactPath: '/tmp/reindex-artifact.json',
      fixturePath: '/tmp/reindex-fixture.json',
      allowGaps: true,
      help: false,
    });
  });

  it('loads and validates a complete dry fixture without live services', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mc2-qdrant-reindex-'));
    const fixturePath = join(directory, 'fixture.json');
    const row = source('60000000-0000-4000-8000-000000000006');
    await writeFile(
      fixturePath,
      JSON.stringify({
        runId: RUN_ID,
        now: '2026-07-10T12:00:00.000Z',
        sources: [{ ...row, sourceAvailable: true }],
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
      const result = await runReindexCommand({ mode: 'plan', allowGaps: false }, deps);
      expect(result.exitCode).toBe(0);
      expect(result.report).toMatchObject({ recoverable: 1, gaps: [] });
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
    const createDefaultDependencies = vi.fn();
    const loadFixtureDependencies = vi.fn().mockResolvedValue(deps);

    const exitCode = await runReindexCli(['plan', '--fixture', '/tmp/reindex-fixture.json'], {
      stdout,
      stderr: vi.fn(),
      createDefaultDependencies,
      loadFixtureDependencies,
    });

    expect(exitCode).toBe(0);
    expect(loadFixtureDependencies).toHaveBeenCalledWith('/tmp/reindex-fixture.json');
    expect(createDefaultDependencies).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledOnce();
    const output = stdout.mock.calls[0][0] as string;
    expect(output).toContain('"dryFixture": true');
    expect(output).not.toContain('storagePath');
    expect(output).not.toContain('/uploads/');
    expect(deps.enqueueJob).not.toHaveBeenCalled();
  });
});
