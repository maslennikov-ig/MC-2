import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertCourseRagReady, mockLogger } = vi.hoisted(() => ({
  mockAssertCourseRagReady: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/jina', () => ({
  rerankDocuments: vi.fn(() => Promise.resolve([])),
}));

describe('section-rag-retriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseParams = {
    courseId: 'course-1',
    sectionId: 'section-1',
    ragPlan: {
      primary_documents: [],
      search_queries: ['query 1'],
      expected_topics: [],
      confidence: 'high' as const,
    },
  };

  it('returns an empty result when the course has no uploaded documents', async () => {
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'optional_no_documents',
      ragRequired: false,
      hasUploadedDocuments: false,
      hasIndexedDocuments: false,
      reason: 'no_uploaded_documents',
    });

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    await expect(retrieveSectionContext(baseParams)).resolves.toMatchObject({
      sectionId: 'section-1',
      chunks: [],
      totalRetrieved: 0,
    });
  });

  it('retries transient Stage 5 required-RAG outages before failing', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');

    mockAssertCourseRagReady.mockRejectedValue(
      new RequiredRagUnavailableError('course-1', 'qdrant_timeout')
    );

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    const promise = retrieveSectionContext(baseParams);
    const expectation = expect(promise).rejects.toMatchObject({
      reason: 'qdrant_timeout',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(4000);

    await expectation;
    expect(mockAssertCourseRagReady).toHaveBeenCalledTimes(3);
  });

  it('continues when an individual required-RAG query fails after preflight', async () => {
    const { searchChunks } = await import('@/shared/qdrant/search');

    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    vi.mocked(searchChunks).mockRejectedValue(new Error('404 page not found'));

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    await expect(retrieveSectionContext(baseParams)).resolves.toMatchObject({
      sectionId: 'section-1',
      chunks: [],
      totalRetrieved: 0,
    });
  });
});
