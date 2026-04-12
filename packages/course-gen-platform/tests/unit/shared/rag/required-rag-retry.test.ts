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

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

describe('required-rag-retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries transient metadata lookup failures with bounded backoff', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');
    const { assertCourseRagReadyWithRetry } = await import('@/shared/rag/required-rag-retry');

    mockAssertCourseRagReady
      .mockRejectedValueOnce(new RequiredRagUnavailableError('course-1', 'metadata_lookup_failed'))
      .mockRejectedValueOnce(new RequiredRagUnavailableError('course-1', 'metadata_lookup_failed'))
      .mockResolvedValueOnce({
        availability: 'ready',
        ragRequired: true,
        hasUploadedDocuments: true,
        hasIndexedDocuments: true,
        reason: 'rag_ready',
      });

    const promise = assertCourseRagReadyWithRetry('course-1');
    await vi.advanceTimersByTimeAsync(4000);

    await expect(promise).resolves.toMatchObject({
      availability: 'ready',
      reason: 'rag_ready',
    });
    expect(mockAssertCourseRagReady).toHaveBeenCalledTimes(3);
  });

  it('fails immediately for deterministic no-indexed-documents preconditions', async () => {
    const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');
    const { assertCourseRagReadyWithRetry } = await import('@/shared/rag/required-rag-retry');

    mockAssertCourseRagReady.mockRejectedValueOnce(
      new RequiredRagUnavailableError('course-1', 'no_indexed_documents')
    );

    await expect(assertCourseRagReadyWithRetry('course-1')).rejects.toMatchObject({
      reason: 'no_indexed_documents',
      retryable: false,
      apiErrorCode: 'PRECONDITION_FAILED',
    });
    expect(mockAssertCourseRagReady).toHaveBeenCalledTimes(1);
  });
});
