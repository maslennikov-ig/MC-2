import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertCourseRagReady, mockCheckCourseHasIndexedDocuments, mockLogger } = vi.hoisted(() => ({
  mockAssertCourseRagReady: vi.fn(),
  mockCheckCourseHasIndexedDocuments: vi.fn(),
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
    checkCourseHasIndexedDocuments: vi.fn((...args) =>
      mockCheckCourseHasIndexedDocuments(...args)
    ),
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
    mockCheckCourseHasIndexedDocuments.mockResolvedValue(false);

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    await expect(retrieveSectionContext(baseParams)).resolves.toMatchObject({
      sectionId: 'section-1',
      chunks: [],
      totalRetrieved: 0,
    });
  });

  it('throws RequiredRagUnavailableError when document-backed Stage 5 loses RAG', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');

    mockAssertCourseRagReady.mockRejectedValue(
      new RequiredRagUnavailableError('course-1', 'qdrant_unavailable')
    );
    mockCheckCourseHasIndexedDocuments.mockResolvedValue(false);

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    await expect(retrieveSectionContext(baseParams)).rejects.toBeInstanceOf(
      RequiredRagUnavailableError
    );
  });

  it('throws RequiredRagUnavailableError when a required-RAG query fails after preflight', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');
    const { searchChunks } = await import('@/shared/qdrant/search');

    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });
    mockCheckCourseHasIndexedDocuments.mockResolvedValue(true);
    vi.mocked(searchChunks).mockRejectedValue(new Error('404 page not found'));

    const { retrieveSectionContext } = await import(
      '@/stages/stage5-generation/utils/section-rag-retriever'
    );

    await expect(retrieveSectionContext(baseParams)).rejects.toBeInstanceOf(
      RequiredRagUnavailableError
    );
  });
});
