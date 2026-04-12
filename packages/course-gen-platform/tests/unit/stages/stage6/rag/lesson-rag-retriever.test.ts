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

vi.mock('@/stages/stage5-generation/utils/rag-context-cache', () => ({
  ragContextCache: {
    get: vi.fn(() => Promise.resolve(null)),
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

describe('lesson-rag-retriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('returns an empty result when the course has no uploaded documents', async () => {
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'optional_no_documents',
      ragRequired: false,
      hasUploadedDocuments: false,
      hasIndexedDocuments: false,
      reason: 'no_uploaded_documents',
    });
    mockCheckCourseHasIndexedDocuments.mockResolvedValue(false);

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
  });

  it('throws RequiredRagUnavailableError when document-backed Stage 6 loses RAG', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');

    mockAssertCourseRagReady.mockRejectedValue(
      new RequiredRagUnavailableError('course-1', 'qdrant_unavailable')
    );
    mockCheckCourseHasIndexedDocuments.mockResolvedValue(false);

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        lessonSpec: lessonSpec as any,
        useCache: false,
      })
    ).rejects.toBeInstanceOf(RequiredRagUnavailableError);
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

    const { retrieveLessonContext } = await import('@/stages/stage6-lesson-content/rag/retriever');

    await expect(
      retrieveLessonContext({
        courseId: 'course-1',
        lessonSpec: lessonSpec as any,
        useCache: false,
      })
    ).rejects.toBeInstanceOf(RequiredRagUnavailableError);
  });
});
