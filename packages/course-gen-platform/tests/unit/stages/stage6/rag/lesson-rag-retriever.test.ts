import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseRagAvailabilityReason } from '@/shared/rag/document-availability';
import type { Stage6AcceptedEvidenceContext } from '@/stages/stage6-lesson-content/rag/evidence-context';

const {
  mockAssertCourseRagReady,
  mockCacheGet,
  mockCacheGetOrRetrieve,
  mockLogger,
  mockPublishMetrics,
} = vi.hoisted(() => ({
  mockAssertCourseRagReady: vi.fn(),
  mockCacheGet: vi.fn(() => Promise.resolve(null)),
  mockCacheGetOrRetrieve: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockPublishMetrics: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/metrics/document-evidence-textfile', () => ({
  publishDocumentEvidenceMetricsSafely: mockPublishMetrics,
}));

vi.mock('@/shared/rag/document-availability', async importOriginal => {
  const original = await importOriginal<typeof import('@/shared/rag/document-availability')>();
  return {
    ...original,
    assertCourseRagReady: vi.fn((...args) => mockAssertCourseRagReady(...args)),
  };
});

vi.mock('@/shared/qdrant/search', () => ({
  searchChunks: vi.fn(),
}));

vi.mock('@/stages/stage5-generation/utils/rag-context-cache', () => ({
  ragContextCache: {
    get: vi.fn((...args) => mockCacheGet(...args)),
    getOrRetrieve: vi.fn((...args) => mockCacheGetOrRetrieve(...args)),
    store: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/stages/stage6-lesson-content/rag/reranking', () => ({
  rerankChunks: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/stages/stage6-lesson-content/rag/coverage', () => ({
  calculateLessonCoverage: vi.fn(() => 0),
}));

const actualDocumentAvailability = await vi.importActual<
  typeof import('@/shared/rag/document-availability')
>('@/shared/rag/document-availability');

function createRequiredRagUnavailableError(reason: CourseRagAvailabilityReason) {
  return new actualDocumentAvailability.RequiredRagUnavailableError('course-1', reason);
}

describe('lesson-rag-retriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const lessonSpec = {
    lesson_id: '1.1',
    title: 'Test lesson',
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Topic',
      key_learning_objectives: 'Goal',
    },
    sections: [
      {
        title: 'Section 1',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: ['Point 1'],
      },
    ],
    exercises: [],
    rag_context: {
      primary_documents: [],
      search_queries: ['query 1'],
      expected_chunks: 7,
    },
    estimated_duration_minutes: 20,
    difficulty_level: 'intermediate',
  } as const;

  const evidenceContext: Stage6AcceptedEvidenceContext = {
    acceptedRunId: '10000000-0000-4000-8000-000000000001',
    decisionIds: ['70000000-0000-4000-8000-000000000001'],
    decisionQueries: ['Retain records for 30 days.'],
    sourceRefs: [
      {
        document_id: '40000000-0000-4000-8000-000000000001',
        chunk_id: 'chunk-accepted',
        version_hash: 'sha256:accepted',
      },
    ],
    rejectedSourceRefs: [
      {
        document_id: '40000000-0000-4000-8000-000000000001',
        chunk_id: 'chunk-rejected',
        version_hash: 'sha256:accepted',
      },
    ],
    allowedDocumentIds: ['40000000-0000-4000-8000-000000000001'],
    sourceVersionByDocumentId: {
      '40000000-0000-4000-8000-000000000001': 'sha256:accepted',
    },
    decisionIdsByDocumentId: {
      '40000000-0000-4000-8000-000000000001': ['70000000-0000-4000-8000-000000000001'],
    },
    globalDecisionIds: [],
    cacheIdentity: 'evidence-cache-identity',
  };

  it('returns an empty result when the course has no uploaded documents', async () => {
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'optional_no_documents',
      ragRequired: false,
      hasUploadedDocuments: false,
      hasIndexedDocuments: false,
      reason: 'no_uploaded_documents',
    });

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        lessonSpec: lessonSpec as any,
        useCache: false,
      })
    ).resolves.toMatchObject({
      lessonId: '1.1',
      chunks: [],
      totalRetrieved: 0,
    });
    expect(mockPublishMetrics).toHaveBeenCalledOnce();
    expect(mockPublishMetrics).toHaveBeenCalledWith(
      { stage: 'stage6', status: 'empty', retrievals: 1, fallbacks: 0 },
      mockLogger
    );
  });

  it('retries transient Stage 6 required-RAG outages before failing', async () => {
    mockAssertCourseRagReady.mockImplementation(() =>
      Promise.reject(createRequiredRagUnavailableError('qdrant_timeout'))
    );

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    const promise = retrieveLessonContext({
      courseId: 'course-1',
      organizationId: 'organization-1',
      lessonSpec: lessonSpec as any,
      useCache: false,
    });
    const expectation = expect(promise).rejects.toMatchObject({
      reason: 'qdrant_timeout',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(4000);

    await expectation;
    expect(mockAssertCourseRagReady).toHaveBeenCalledTimes(3);
    expect(mockPublishMetrics).toHaveBeenCalledOnce();
    expect(mockPublishMetrics).toHaveBeenCalledWith(
      { stage: 'stage6', status: 'failed', retrievals: 1, fallbacks: 0 },
      mockLogger
    );
  });

  it('fails through the required-RAG policy when every live query fails after preflight', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');

    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockRejectedValue(new Error('404 page not found'));

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        useCache: false,
      })
    ).rejects.toMatchObject({
      reason: 'qdrant_service_unavailable',
      retryable: true,
    });
  });

  it('publishes one fallback outcome when optional live retrieval degrades', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: false,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockRejectedValue(new Error('private retrieval failure'));
    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        useCache: false,
      })
    ).resolves.toMatchObject({ totalRetrieved: 0 });

    expect(mockPublishMetrics).toHaveBeenCalledOnce();
    expect(mockPublishMetrics).toHaveBeenCalledWith(
      { stage: 'stage6', status: 'fallback', retrievals: 1, fallbacks: 1 },
      mockLogger
    );
  });

  it('uses accepted decisions and refs in grouped tenant-scoped live retrieval', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockResolvedValue({ results: [], metadata: {} } as any);

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');
    await retrieveLessonContext({
      courseId: 'course-1',
      organizationId: 'organization-1',
      lessonSpec: lessonSpec as any,
      evidenceContext,
      useCache: false,
    });

    expect(searchChunks).toHaveBeenCalledTimes(2);
    expect(vi.mocked(searchChunks).mock.calls.map(([query]) => query)).toEqual([
      'query 1',
      'Point 1',
    ]);
    for (const [, options] of vi.mocked(searchChunks).mock.calls) {
      expect(options).toMatchObject({
        include_payload: true,
        group_by_document: true,
        group_size: 2,
        filters: {
          organization_id: 'organization-1',
          course_id: 'course-1',
          document_ids: evidenceContext.allowedDocumentIds,
        },
      });
    }
  });

  it('rejects a cross-scope or stale Qdrant result even when the backend ignored filters', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockResolvedValue({
      results: [
        {
          chunk_id: 'foreign-chunk',
          document_id: '40000000-0000-4000-8000-000000000099',
          document_name: 'Foreign.pdf',
          content: 'foreign',
          heading_path: 'Foreign',
          score: 0.9,
          payload: {
            organization_id: 'organization-2',
            course_id: 'course-2',
            version_hash: 'sha256:stale',
          },
        },
      ],
      metadata: {},
    } as any);

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');
    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        evidenceContext,
        useCache: false,
      })
    ).rejects.toThrow(/scope|tenant|stale/i);
  });

  it('rejects an unknown or rejected chunk from an otherwise accepted document', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-rejected',
          document_id: '40000000-0000-4000-8000-000000000001',
          document_name: 'Accepted.pdf',
          content: 'rejected side',
          heading_path: 'Conflict',
          score: 0.9,
          payload: {
            organization_id: 'organization-1',
            course_id: 'course-1',
            version_hash: 'sha256:accepted',
          },
        },
      ],
      metadata: {},
    } as any);

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');
    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        evidenceContext,
        useCache: false,
      })
    ).rejects.toThrow(/source ref|chunk|accepted evidence/i);
  });

  it('keys cached lesson context by accepted-run decision/ref identity', async () => {
    mockCacheGet.mockResolvedValueOnce({
      chunks: [],
      searchQueriesUsed: [],
      coverageScore: 0,
    });
    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');
    await retrieveLessonContext({
      courseId: 'course-1',
      organizationId: 'organization-1',
      lessonSpec: lessonSpec as any,
      evidenceContext,
      useCache: true,
    });

    expect(mockCacheGet).toHaveBeenCalledWith(
      expect.stringContaining(evidenceContext.cacheIdentity)
    );
    expect(mockAssertCourseRagReady).not.toHaveBeenCalled();
  });

  it('does not broaden retrieval when lesson refs are all rejected by accepted decisions', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    const rejectedLesson = {
      ...lessonSpec,
      rag_context: {
        ...lessonSpec.rag_context,
        primary_documents: ['40000000-0000-4000-8000-000000000099'],
      },
    };
    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: rejectedLesson as any,
        evidenceContext,
        useCache: false,
      })
    ).resolves.toMatchObject({ chunks: [], totalRetrieved: 0 });
    expect(searchChunks).not.toHaveBeenCalled();
  });

  it('rejects cached chunks outside the current accepted evidence identity', async () => {
    mockCacheGet.mockResolvedValueOnce({
      chunks: [
        {
          chunkId: 'stale-chunk',
          documentId: '40000000-0000-4000-8000-000000000099',
          documentName: 'Stale.pdf',
          content: 'stale',
          headingPath: 'Stale',
          score: 0.9,
          matchedQuery: 'old decision',
        },
      ],
      searchQueriesUsed: [],
      coverageScore: 1,
    });
    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        evidenceContext,
        useCache: true,
      })
    ).rejects.toThrow(/cache.*accepted evidence|scope/i);
  });

  it('rejects a cached rejected chunk even when its document is still accepted', async () => {
    mockCacheGet.mockResolvedValueOnce({
      chunks: [
        {
          chunkId: 'chunk-rejected',
          documentId: '40000000-0000-4000-8000-000000000001',
          documentName: 'Accepted.pdf',
          content: 'rejected side',
          headingPath: 'Conflict',
          score: 0.9,
          matchedQuery: 'old decision',
        },
      ],
      searchQueriesUsed: [],
      coverageScore: 1,
    });
    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        organizationId: 'organization-1',
        lessonSpec: lessonSpec as any,
        evidenceContext,
        useCache: true,
      })
    ).rejects.toThrow(/cache.*accepted evidence|scope/i);
  });

  it('uses cached lesson context before checking live RAG availability', async () => {
    mockCacheGet.mockResolvedValueOnce({
      chunks: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentName: 'Doc 1',
          content: 'Cached content',
          headingPath: 'Section 1',
          score: 0.91,
          matchedQuery: 'query 1',
        },
      ],
      searchQueriesUsed: ['query 1'],
      coverageScore: 0.8,
    });
    mockAssertCourseRagReady.mockImplementationOnce(() =>
      Promise.reject(createRequiredRagUnavailableError('qdrant_timeout'))
    );

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        lessonSpec: lessonSpec as any,
        useCache: true,
      })
    ).resolves.toMatchObject({
      lessonId: '1.1',
      cached: true,
      totalRetrieved: 1,
      chunks: [
        expect.objectContaining({
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          document_name: 'Doc 1',
        }),
      ],
    });

    expect(mockAssertCourseRagReady).not.toHaveBeenCalled();
  });
});
