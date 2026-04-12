import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSupabaseAdmin, mockGetCollection, mockLogger } = vi.hoisted(() => ({
  mockGetSupabaseAdmin: vi.fn(),
  mockGetCollection: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockGetSupabaseAdmin()),
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    getCollection: vi.fn((...args) => mockGetCollection(...args)),
  },
}));

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

describe('document-availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createSupabaseWithFileCatalogRows(rows: Array<{ id: string; vector_status: string }>) {
    return {
      from: vi.fn((table: string) => {
        expect(table).toBe('file_catalog');

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: rows,
              error: null,
            })),
          })),
        };
      }),
    };
  }

  it('returns optional_no_documents when a course has no uploaded documents', async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabaseWithFileCatalogRows([]));

    const { clearAllDocumentAvailabilityCache, resolveCourseRagAvailability } = await import(
      '@/shared/rag/document-availability'
    );
    clearAllDocumentAvailabilityCache();

    await expect(resolveCourseRagAvailability('course-no-docs')).resolves.toMatchObject({
      availability: 'optional_no_documents',
      ragRequired: false,
      hasUploadedDocuments: false,
      hasIndexedDocuments: false,
      reason: 'no_uploaded_documents',
    });

    expect(mockGetCollection).not.toHaveBeenCalled();
  });

  it('returns ready when indexed documents exist and Qdrant collection is reachable', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabaseWithFileCatalogRows([{ id: 'file-1', vector_status: 'indexed' }])
    );
    mockGetCollection.mockResolvedValue({ status: 'green' });

    const { clearAllDocumentAvailabilityCache, resolveCourseRagAvailability } = await import(
      '@/shared/rag/document-availability'
    );
    clearAllDocumentAvailabilityCache();

    await expect(resolveCourseRagAvailability('course-ready')).resolves.toMatchObject({
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    });

    expect(mockGetCollection).toHaveBeenCalledWith('course_embeddings');
  });

  it('returns required_unavailable when documents exist but none are indexed', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabaseWithFileCatalogRows([{ id: 'file-1', vector_status: 'failed' }])
    );

    const { clearAllDocumentAvailabilityCache, resolveCourseRagAvailability } = await import(
      '@/shared/rag/document-availability'
    );
    clearAllDocumentAvailabilityCache();

    await expect(resolveCourseRagAvailability('course-unindexed')).resolves.toMatchObject({
      availability: 'required_unavailable',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: false,
      reason: 'no_indexed_documents',
    });

    expect(mockGetCollection).not.toHaveBeenCalled();
  });

  it('throws RequiredRagUnavailableError from assertCourseRagReady when Qdrant is unavailable', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabaseWithFileCatalogRows([{ id: 'file-1', vector_status: 'indexed' }])
    );
    mockGetCollection.mockRejectedValue(new Error('404 page not found'));

    const {
      clearAllDocumentAvailabilityCache,
      assertCourseRagReady,
      RequiredRagUnavailableError,
    } = await import('@/shared/rag/document-availability');
    clearAllDocumentAvailabilityCache();

    await expect(assertCourseRagReady('course-qdrant-down')).rejects.toBeInstanceOf(
      RequiredRagUnavailableError
    );
  });
});
