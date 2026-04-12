import { QdrantClientTimeoutError } from '@qdrant/js-client-rest';
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

  it('classifies metadata lookup failures as retryable required-RAG outages', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: null,
            error: { message: 'temporary read failure' },
          })),
        })),
      })),
    });

    const {
      clearAllDocumentAvailabilityCache,
      assertCourseRagReady,
      RequiredRagUnavailableError,
    } = await import('@/shared/rag/document-availability');
    clearAllDocumentAvailabilityCache();

    await expect(assertCourseRagReady('course-metadata-error')).rejects.toBeInstanceOf(
      RequiredRagUnavailableError
    );
    await expect(assertCourseRagReady('course-metadata-error')).rejects.toMatchObject({
      reason: 'metadata_lookup_failed',
      retryable: true,
      apiErrorCode: 'SERVICE_UNAVAILABLE',
    });
  });

  it('classifies transient Qdrant timeouts as retryable service outages', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabaseWithFileCatalogRows([{ id: 'file-1', vector_status: 'indexed' }])
    );
    mockGetCollection.mockRejectedValue(new QdrantClientTimeoutError('Request timed out'));

    const {
      clearAllDocumentAvailabilityCache,
      assertCourseRagReady,
      RequiredRagUnavailableError,
    } = await import('@/shared/rag/document-availability');
    clearAllDocumentAvailabilityCache();

    await expect(assertCourseRagReady('course-qdrant-down')).rejects.toBeInstanceOf(
      RequiredRagUnavailableError
    );
    await expect(assertCourseRagReady('course-qdrant-down')).rejects.toMatchObject({
      reason: 'qdrant_timeout',
      retryable: true,
      apiErrorCode: 'SERVICE_UNAVAILABLE',
    });
  });

  it('uses a reason-specific message when indexed documents are unavailable', async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabaseWithFileCatalogRows([{ id: 'file-1', vector_status: 'failed' }])
    );

    const {
      clearAllDocumentAvailabilityCache,
      assertCourseRagReady,
      RequiredRagUnavailableError,
    } = await import('@/shared/rag/document-availability');
    clearAllDocumentAvailabilityCache();

    await expect(assertCourseRagReady('course-unindexed')).rejects.toThrow(
      'RAG is required for this course, but indexed documents are unavailable'
    );
    await expect(assertCourseRagReady('course-unindexed')).rejects.toMatchObject({
      reason: 'no_indexed_documents',
      retryable: false,
      apiErrorCode: 'PRECONDITION_FAILED',
    });
  });
});
