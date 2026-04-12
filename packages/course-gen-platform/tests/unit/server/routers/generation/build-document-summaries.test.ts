import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertCourseRagReady,
  mockLogger,
  mockNotifyCourseError,
  mockSetNestedValue,
  mockThrowOnSupabaseError,
} = vi.hoisted(() => ({
  mockAssertCourseRagReady: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockNotifyCourseError: vi.fn(),
  mockSetNestedValue: vi.fn(),
  mockThrowOnSupabaseError: vi.fn(),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@megacampus/shared-utils', () => ({
  setNestedValue: vi.fn((...args) => mockSetNestedValue(...args)),
}));

vi.mock('@/shared/rag/document-availability', async importOriginal => {
  const original = await importOriginal<typeof import('@/shared/rag/document-availability')>();
  return {
    ...original,
    assertCourseRagReady: vi.fn((...args) => mockAssertCourseRagReady(...args)),
  };
});

vi.mock('@/server/utils/supabase-query-guard', () => ({
  throwOnSupabaseError: vi.fn((...args) => mockThrowOnSupabaseError(...args)),
}));

vi.mock('@/shared/notifications', () => ({
  notifyCourseError: vi.fn((...args) => mockNotifyCourseError(...args)),
}));

describe('buildDocumentSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createSupabaseVectorizedFiles(rows: Array<Record<string, unknown>>) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: rows,
              error: null,
            }),
          })),
        })),
      })),
    } as any;
  }

  it('returns empty summaries when the course has no uploaded documents', async () => {
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'optional_no_documents',
      ragRequired: false,
      hasUploadedDocuments: false,
      hasIndexedDocuments: false,
      reason: 'no_uploaded_documents',
    });

    const { buildDocumentSummaries } = await import('@/server/routers/generation/_shared/helpers');

    await expect(
      buildDocumentSummaries(createSupabaseVectorizedFiles([]), 'course-no-docs')
    ).resolves.toEqual({
      hasVectorizedDocs: false,
      documentSummaries: [],
    });
  });

  it('throws when RAG is required but unavailable', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');

    mockAssertCourseRagReady.mockRejectedValue(
      new RequiredRagUnavailableError('course-rag-down', 'qdrant_unavailable')
    );

    const { buildDocumentSummaries } = await import('@/server/routers/generation/_shared/helpers');

    await expect(
      buildDocumentSummaries(createSupabaseVectorizedFiles([]), 'course-rag-down')
    ).rejects.toBeInstanceOf(RequiredRagUnavailableError);
    expect(mockNotifyCourseError).toHaveBeenCalledWith(
      'course-rag-down',
      5,
      'RAG is required for this course, but Qdrant is unavailable'
    );
  });

  it('returns vectorized document summaries when RAG is ready', async () => {
    mockAssertCourseRagReady.mockResolvedValue({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });

    const { buildDocumentSummaries } = await import('@/server/routers/generation/_shared/helpers');

    await expect(
      buildDocumentSummaries(
        createSupabaseVectorizedFiles([
          {
            id: 'file-1',
            filename: 'doc-1.md',
            processed_content: '# Doc 1',
            mime_type: 'text/markdown',
          },
        ]),
        'course-ready'
      )
    ).resolves.toEqual({
      hasVectorizedDocs: true,
      documentSummaries: [
        {
          file_id: 'file-1',
          file_name: 'doc-1.md',
          summary: '# Doc 1',
          key_topics: [],
        },
      ],
    });
  });
});
