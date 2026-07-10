import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBm25Document } from '@/shared/qdrant/config';
import { hybridSearchNative, sparseSearch } from '@/shared/qdrant/search-operations';
import type { SearchFilters, SearchOptions } from '@/shared/qdrant/search-types';

const { mockGenerateQueryEmbedding, mockQuery, mockSearch, mockLogger } = vi.hoisted(() => ({
  mockGenerateQueryEmbedding: vi.fn(),
  mockQuery: vi.fn(),
  mockSearch: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/embeddings/generate', () => ({
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    query: mockQuery,
    search: mockSearch,
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

type ResolvedSearchOptions = Required<Omit<SearchOptions, 'filters'>> & {
  filters: SearchFilters;
};

function createOptions(): ResolvedSearchOptions {
  return {
    limit: 5,
    score_threshold: 0.25,
    collection_name: 'course_embeddings',
    enable_hybrid: true,
    include_payload: true,
    filters: { organization_id: 'organization-1', course_id: 'course-1' },
    enable_priority_boost: false,
    priority_boost_factor: 0.4,
  };
}

describe('native BM25 search requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValue({ points: [] });
    mockSearch.mockResolvedValue([]);
  });

  it('uses a native BM25 document for sparse search', async () => {
    const queryText = 'Пример course query';

    await sparseSearch(queryText, createOptions());

    expect(mockQuery).toHaveBeenCalledWith('course_embeddings', {
      query: createBm25Document(queryText),
      using: 'sparse',
      filter: {
        must: [
          { key: 'organization_id', match: { value: 'organization-1' } },
          { key: 'course_id', match: { value: 'course-1' } },
        ],
      },
      limit: 5,
      with_payload: true,
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('uses the same native BM25 document in the sparse hybrid prefetch', async () => {
    const queryText = 'Гибридный search query';

    await hybridSearchNative(queryText, createOptions());

    expect(mockQuery).toHaveBeenCalledWith(
      'course_embeddings',
      expect.objectContaining({
        prefetch: [
          expect.objectContaining({
            query: createBm25Document(queryText),
            using: 'sparse',
          }),
          expect.objectContaining({
            query: [0.1, 0.2, 0.3],
            using: 'dense',
            score_threshold: 0.25,
          }),
        ],
        query: { fusion: 'rrf' },
      })
    );
  });
});
