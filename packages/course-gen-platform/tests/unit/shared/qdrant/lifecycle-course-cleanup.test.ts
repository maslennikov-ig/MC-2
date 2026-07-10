import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetCollections, mockGetCollection, mockCount, mockDelete, mockLogger } = vi.hoisted(
  () => ({
    mockGetCollections: vi.fn(),
    mockGetCollection: vi.fn(),
    mockCount: vi.fn(),
    mockDelete: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  })
);

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    getCollections: mockGetCollections,
    getCollection: mockGetCollection,
    count: mockCount,
    delete: mockDelete,
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

import { deleteVectorsForCourse } from '@/shared/qdrant/lifecycle';

const COURSE_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Qdrant course vector cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCollections.mockResolvedValue({
      collections: [{ name: 'course_embeddings_v1' }],
    });
    mockGetCollection.mockResolvedValue({ status: 'green' });
    mockCount.mockResolvedValue({ count: 3 });
    mockDelete.mockResolvedValue({ status: 'completed' });
  });

  it('deletes isolated course vectors through the stable alias when only its physical target is listed', async () => {
    await expect(deleteVectorsForCourse(COURSE_ID)).resolves.toEqual({
      deleted: true,
      approximateCount: 3,
    });

    expect(mockGetCollections).not.toHaveBeenCalled();
    expect(mockGetCollection).toHaveBeenCalledWith('course_embeddings');
    expect(mockCount).toHaveBeenCalledWith('course_embeddings', {
      filter: {
        must: [{ key: 'course_id', match: { value: COURSE_ID } }],
      },
      exact: false,
    });
    expect(mockDelete).toHaveBeenCalledWith('course_embeddings', {
      filter: {
        must: [{ key: 'course_id', match: { value: COURSE_ID } }],
      },
      wait: true,
    });
  });
});
