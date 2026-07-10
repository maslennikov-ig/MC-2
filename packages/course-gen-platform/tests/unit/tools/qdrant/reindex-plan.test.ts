import { describe, expect, it, vi } from 'vitest';
import { DocumentProcessingJobDataSchema, JobType } from '@megacampus/shared-types';
import {
  buildReindexPlan,
  getReindexPlanExitCode,
  loadReindexSources,
  mapDatabaseReindexSources,
  verifyReindexParity,
  type ReindexSourceRow,
} from '../../../../tools/qdrant/reindex-plan';

const BASE_JOB = {
  jobType: JobType.DOCUMENT_PROCESSING,
  organizationId: '10000000-0000-4000-8000-000000000001',
  courseId: '20000000-0000-4000-8000-000000000002',
  userId: '30000000-0000-4000-8000-000000000003',
  fileId: '40000000-0000-4000-8000-000000000004',
  filePath: '/tmp/source.pdf',
  mimeType: 'application/pdf',
  createdAt: '2026-07-10T12:00:00.000Z',
};

describe('Qdrant reindex job contract', () => {
  it('retains a valid physical target and reindex run UUID', () => {
    const parsed = DocumentProcessingJobDataSchema.parse({
      ...BASE_JOB,
      qdrantTargetCollection: 'course_embeddings_v2',
      qdrantReindexRunId: '50000000-0000-4000-8000-000000000005',
    });

    expect(parsed.qdrantTargetCollection).toBe('course_embeddings_v2');
    expect(parsed.qdrantReindexRunId).toBe('50000000-0000-4000-8000-000000000005');
  });

  it('rejects invalid target and run identifiers', () => {
    expect(
      DocumentProcessingJobDataSchema.safeParse({
        ...BASE_JOB,
        qdrantTargetCollection: '',
        qdrantReindexRunId: 'not-a-uuid',
      }).success
    ).toBe(false);
  });

  it('keeps normal document-processing jobs backward compatible', () => {
    expect(DocumentProcessingJobDataSchema.safeParse(BASE_JOB).success).toBe(true);
  });
});

const SOURCE_BASE: ReindexSourceRow = {
  id: '60000000-0000-4000-8000-000000000006',
  organizationId: '10000000-0000-4000-8000-000000000001',
  courseId: '20000000-0000-4000-8000-000000000002',
  userId: '30000000-0000-4000-8000-000000000003',
  storagePath: 'uploads/org/course/source.pdf',
  mimeType: 'application/pdf',
  priority: 'CORE',
  vectorStatus: 'indexed',
  chunkCount: 7,
  locale: 'ru',
  alreadyEnqueued: false,
};

describe('buildReindexPlan', () => {
  it('classifies recoverable and missing source rows with explicit gaps', () => {
    const missingId = '70000000-0000-4000-8000-000000000007';
    const rows = [SOURCE_BASE, { ...SOURCE_BASE, id: missingId }];

    const plan = buildReindexPlan(rows, row => row.id !== missingId);

    expect(plan).toMatchObject({
      eligible: 2,
      recoverable: 1,
      missingSource: 1,
      estimatedDocuments: 1,
      expectedDocuments: 1,
      estimatedPoints: 7,
      unknownPointEstimates: 0,
      estimatedJinaRequests: { minimum: 1, maximum: 7 },
      gaps: [{ fileId: missingId, reason: 'source_missing' }],
      candidateFileIds: [SOURCE_BASE.id],
    });
  });

  it('separates unsupported and already-enqueued identities deterministically', () => {
    const unsupportedId = '80000000-0000-4000-8000-000000000008';
    const enqueuedId = '90000000-0000-4000-8000-000000000009';
    const missingCourseId = 'a0000000-0000-4000-8000-00000000000a';
    const rows: ReindexSourceRow[] = [
      { ...SOURCE_BASE, id: enqueuedId, alreadyEnqueued: true },
      { ...SOURCE_BASE, id: unsupportedId, mimeType: 'application/octet-stream' },
      { ...SOURCE_BASE, id: missingCourseId, courseId: null },
      SOURCE_BASE,
    ];

    const forward = buildReindexPlan(rows, () => true);
    const reverse = buildReindexPlan([...rows].reverse(), () => true);

    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({
      eligible: 2,
      recoverable: 1,
      alreadyEnqueued: 1,
      unsupported: 2,
      expectedDocuments: 2,
      candidateFileIds: [SOURCE_BASE.id],
      alreadyEnqueuedFileIds: [enqueuedId],
      gaps: [
        { fileId: unsupportedId, reason: 'unsupported_mime' },
        { fileId: missingCourseId, reason: 'missing_course' },
      ],
    });
  });

  it('lets allow-gaps change only the exit code', () => {
    const plan = buildReindexPlan([SOURCE_BASE], () => false);
    const snapshot = structuredClone(plan);

    expect(getReindexPlanExitCode(plan, false)).toBe(2);
    expect(getReindexPlanExitCode(plan, true)).toBe(0);
    expect(plan).toEqual(snapshot);
  });

  it('reports unknown point/request estimates instead of inventing batch precision', () => {
    const plan = buildReindexPlan([{ ...SOURCE_BASE, chunkCount: null }], () => true);

    expect(plan).toMatchObject({
      estimatedPoints: 0,
      unknownPointEstimates: 1,
      estimatedJinaRequests: { minimum: 0, maximum: null },
    });
  });

  it('refuses a file/course tenant mismatch as an explicit source integrity gap', () => {
    const plan = buildReindexPlan(
      [
        {
          ...SOURCE_BASE,
          courseOrganizationId: 'f0000000-0000-4000-8000-00000000000f',
        },
      ],
      () => true
    );

    expect(plan).toMatchObject({
      eligible: 0,
      unsupported: 1,
      gaps: [{ fileId: SOURCE_BASE.id, reason: 'organization_mismatch' }],
    });
  });

  it('classifies a non-canonical source path as an explicit integrity gap', () => {
    const plan = buildReindexPlan([SOURCE_BASE], () => 'invalid_source_path');

    expect(plan).toMatchObject({
      recoverable: 0,
      invalidSourcePath: 1,
      gaps: [{ fileId: SOURCE_BASE.id, reason: 'invalid_source_path' }],
    });
  });
});

describe('mapDatabaseReindexSources', () => {
  it('maps only proven file_catalog and course fields into Stage 2 source rows', () => {
    const mapped = mapDatabaseReindexSources(
      [
        {
          id: SOURCE_BASE.id,
          organization_id: SOURCE_BASE.organizationId,
          course_id: SOURCE_BASE.courseId,
          storage_path: SOURCE_BASE.storagePath,
          mime_type: SOURCE_BASE.mimeType,
          priority: SOURCE_BASE.priority,
          vector_status: SOURCE_BASE.vectorStatus,
          chunk_count: SOURCE_BASE.chunkCount,
        },
      ],
      [
        {
          id: SOURCE_BASE.courseId!,
          organization_id: SOURCE_BASE.organizationId,
          user_id: SOURCE_BASE.userId!,
          language: 'en',
        },
      ]
    );

    expect(mapped).toEqual([
      {
        ...SOURCE_BASE,
        locale: 'en',
        courseOrganizationId: SOURCE_BASE.organizationId,
      },
    ]);
  });

  it('loads course ownership only for file_catalog course identities', async () => {
    const file = {
      id: SOURCE_BASE.id,
      organization_id: SOURCE_BASE.organizationId,
      course_id: SOURCE_BASE.courseId,
      storage_path: SOURCE_BASE.storagePath,
      mime_type: SOURCE_BASE.mimeType,
      priority: SOURCE_BASE.priority,
      vector_status: SOURCE_BASE.vectorStatus,
      chunk_count: SOURCE_BASE.chunkCount,
    };
    const course = {
      id: SOURCE_BASE.courseId!,
      organization_id: SOURCE_BASE.organizationId,
      user_id: SOURCE_BASE.userId!,
      language: 'ru',
    };
    const database = {
      countFileCatalogSources: vi.fn().mockResolvedValue(1),
      listFileCatalogSourcesPage: vi.fn().mockResolvedValue([file]),
      listCourseSources: vi.fn().mockResolvedValue([course]),
    };

    const result = await loadReindexSources(database, SOURCE_BASE.courseId!);

    expect(database.countFileCatalogSources).toHaveBeenCalledWith(SOURCE_BASE.courseId);
    expect(database.listFileCatalogSourcesPage).toHaveBeenCalledWith({
      courseId: SOURCE_BASE.courseId,
      afterId: undefined,
      limit: 500,
    });
    expect(database.listCourseSources).toHaveBeenCalledWith([SOURCE_BASE.courseId]);
    expect(result).toEqual([{ ...SOURCE_BASE, courseOrganizationId: SOURCE_BASE.organizationId }]);
  });

  it('keyset-pages more than 1000 files and batches every course lookup deterministically', async () => {
    const files = Array.from({ length: 1205 }, (_, index) => {
      const suffix = String(index).padStart(4, '0');
      return {
        id: `file-${suffix}`,
        organization_id: SOURCE_BASE.organizationId,
        course_id: `course-${suffix}`,
        storage_path: `uploads/org/course/source-${suffix}.pdf`,
        mime_type: SOURCE_BASE.mimeType,
        priority: SOURCE_BASE.priority,
        vector_status: SOURCE_BASE.vectorStatus,
        chunk_count: 1,
      };
    });
    const listFileCatalogSourcesPage = vi.fn(
      ({ afterId, limit }: { afterId?: string; limit: number }) => {
        const start = afterId ? files.findIndex(file => file.id === afterId) + 1 : 0;
        return Promise.resolve(files.slice(start, start + limit));
      }
    );
    const listCourseSources = vi.fn((courseIds: readonly string[]) =>
      Promise.resolve(
        courseIds.map(id => ({
          id,
          organization_id: SOURCE_BASE.organizationId,
          user_id: SOURCE_BASE.userId!,
          language: 'ru',
        }))
      )
    );

    const result = await loadReindexSources({
      countFileCatalogSources: vi.fn().mockResolvedValue(files.length),
      listFileCatalogSourcesPage,
      listCourseSources,
    });

    expect(result).toHaveLength(files.length);
    expect(result.at(-1)?.id).toBe('file-1204');
    expect(listFileCatalogSourcesPage).toHaveBeenCalledTimes(3);
    expect(listFileCatalogSourcesPage.mock.calls.map(([input]) => input.afterId)).toEqual([
      undefined,
      'file-0499',
      'file-0999',
    ]);
    expect(listCourseSources.mock.calls.every(([ids]) => ids.length <= 200)).toBe(true);
    expect(listCourseSources.mock.calls.flatMap(([ids]) => ids)).toHaveLength(files.length);
  });

  it('fails closed when paged source rows do not match the independent exact count', async () => {
    await expect(
      loadReindexSources({
        countFileCatalogSources: vi.fn().mockResolvedValue(2),
        listFileCatalogSourcesPage: vi.fn().mockResolvedValue([]),
        listCourseSources: vi.fn().mockResolvedValue([]),
      })
    ).rejects.toThrow(/exact source count/i);
  });
});

describe('verifyReindexParity', () => {
  const secondSource: ReindexSourceRow = {
    ...SOURCE_BASE,
    id: 'b0000000-0000-4000-8000-00000000000b',
    courseId: 'c0000000-0000-4000-8000-00000000000c',
    locale: 'en',
  };

  it('passes exact source/index parity with native RU and EN relevance', () => {
    const result = verifyReindexParity({
      expectedSources: [SOURCE_BASE, secondSource],
      indexedDocuments: [
        {
          documentId: SOURCE_BASE.id,
          courseId: SOURCE_BASE.courseId!,
          organizationId: SOURCE_BASE.organizationId,
          pointCount: SOURCE_BASE.chunkCount!,
        },
        {
          documentId: secondSource.id,
          courseId: secondSource.courseId!,
          organizationId: secondSource.organizationId,
          pointCount: secondSource.chunkCount!,
        },
      ],
      schemaVerification: { ok: true, mismatches: [] },
      relevanceChecks: [
        { language: 'ru', passed: true, nativeHybrid: true },
        { language: 'en', passed: true, nativeHybrid: true },
      ],
    });

    expect(result).toEqual({
      ok: true,
      expectedDocuments: 2,
      indexedDocuments: 2,
      expectedKnownPoints: 14,
      indexedPoints: 14,
      missingDocumentIds: [],
      extraDocumentIds: [],
      contextMismatches: [],
      countMismatches: [],
      pointCountMismatches: [],
      schemaMismatches: [],
      relevanceFailures: [],
    });
  });

  it('fails missing, extra, tenant/count, schema, and relevance mismatches', () => {
    const extraId = 'd0000000-0000-4000-8000-00000000000d';
    const wrongCourseId = 'e0000000-0000-4000-8000-00000000000e';
    const wrongOrganizationId = 'f0000000-0000-4000-8000-00000000000f';

    const result = verifyReindexParity({
      expectedSources: [SOURCE_BASE, secondSource],
      indexedDocuments: [
        {
          documentId: SOURCE_BASE.id,
          courseId: wrongCourseId,
          organizationId: SOURCE_BASE.organizationId,
          pointCount: SOURCE_BASE.chunkCount!,
        },
        {
          documentId: extraId,
          courseId: secondSource.courseId!,
          organizationId: wrongOrganizationId,
          pointCount: secondSource.chunkCount!,
        },
      ],
      schemaVerification: { ok: false, mismatches: ['vectors.dense.size'] },
      relevanceChecks: [
        { language: 'ru', passed: true, nativeHybrid: true },
        { language: 'en', passed: false, nativeHybrid: true },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.missingDocumentIds).toEqual([secondSource.id]);
    expect(result.extraDocumentIds).toEqual([extraId]);
    expect(result.contextMismatches).toEqual([
      {
        documentId: SOURCE_BASE.id,
        expectedCourseId: SOURCE_BASE.courseId,
        actualCourseId: wrongCourseId,
        expectedOrganizationId: SOURCE_BASE.organizationId,
        actualOrganizationId: SOURCE_BASE.organizationId,
      },
    ]);
    expect(result.countMismatches).toEqual(
      expect.arrayContaining([
        { scope: 'course', id: SOURCE_BASE.courseId, expected: 1, actual: 0 },
        { scope: 'organization', id: wrongOrganizationId, expected: 0, actual: 1 },
      ])
    );
    expect(result.schemaMismatches).toEqual(['vectors.dense.size']);
    expect(result.relevanceFailures).toEqual(['en']);
  });

  it('fails when a present document has fewer points than its persisted chunk count', () => {
    const result = verifyReindexParity({
      expectedSources: [SOURCE_BASE],
      indexedDocuments: [
        {
          documentId: SOURCE_BASE.id,
          courseId: SOURCE_BASE.courseId!,
          organizationId: SOURCE_BASE.organizationId,
          pointCount: SOURCE_BASE.chunkCount! - 1,
        },
      ],
      schemaVerification: { ok: true, mismatches: [] },
      relevanceChecks: [
        { language: 'ru', passed: true, nativeHybrid: true },
        { language: 'en', passed: true, nativeHybrid: true },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.pointCountMismatches).toEqual([
      {
        documentId: SOURCE_BASE.id,
        expected: SOURCE_BASE.chunkCount,
        actual: SOURCE_BASE.chunkCount! - 1,
      },
    ]);
  });
});
