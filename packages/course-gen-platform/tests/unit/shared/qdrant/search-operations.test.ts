import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schemas } from '@qdrant/js-client-rest';
import { createBm25Document } from '@/shared/qdrant/config';
import {
  buildHybridPrefetch,
  buildPriorityFormula,
  denseSearch,
  flattenDocumentGroups,
  hybridSearchNative,
  hybridSearchWithFallback,
  sparseSearch,
} from '@/shared/qdrant/search-operations';
import { generateSearchCacheKey } from '@/shared/qdrant/search-helpers';
import type {
  ResolvedSearchOptions,
  SearchFilters,
  SearchOptions,
} from '@/shared/qdrant/search-types';

const {
  mockGenerateQueryEmbedding,
  mockQuery,
  mockQueryGroups,
  mockSearch,
  mockLogger,
  mockRecordHybridSearchOutcome,
} = vi.hoisted(() => ({
  mockGenerateQueryEmbedding: vi.fn(),
  mockQuery: vi.fn(),
  mockQueryGroups: vi.fn(),
  mockSearch: vi.fn(),
  mockRecordHybridSearchOutcome: vi.fn().mockResolvedValue(undefined),
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
    queryGroups: mockQueryGroups,
    search: mockSearch,
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/shared/qdrant/metrics-textfile', () => ({
  recordHybridSearchOutcome: mockRecordHybridSearchOutcome,
}));

function createOptions(overrides: Partial<SearchOptions> = {}): ResolvedSearchOptions {
  return {
    limit: 5,
    score_threshold: 0.25,
    collection_name: 'course_embeddings',
    enable_hybrid: true,
    include_payload: true,
    filters: { organization_id: 'organization-1', course_id: 'course-1' },
    enable_priority_boost: false,
    priority_boost_factor: 0.4,
    group_by_document: false,
    group_size: 2,
    ...overrides,
  };
}

function scoredPoint(id: string, score: number): Schemas['ScoredPoint'] {
  return {
    id,
    version: 1,
    score,
    payload: { document_id: id.slice(0, 1), content: id },
  };
}

describe('native Qdrant query builders', () => {
  it('builds native BM25 and dense prefetches with threshold only on dense', () => {
    const queryText = 'Гибридный search query';

    expect(buildHybridPrefetch(queryText, [0.1, 0.2, 0.3], createOptions())).toEqual([
      {
        query: createBm25Document(queryText),
        using: 'sparse',
        limit: 30,
        filter: {
          must: [
            { key: 'organization_id', match: { value: 'organization-1' } },
            { key: 'course_id', match: { value: 'course-1' } },
          ],
        },
      },
      {
        query: [0.1, 0.2, 0.3],
        using: 'dense',
        limit: 30,
        filter: {
          must: [
            { key: 'organization_id', match: { value: 'organization-1' } },
            { key: 'course_id', match: { value: 'course-1' } },
          ],
        },
        score_threshold: 0.25,
      },
    ]);
  });

  it('builds the approved multiplicative priority formula with a missing-weight default', () => {
    expect(buildPriorityFormula(0.4)).toEqual({
      formula: {
        mult: [
          '$score',
          {
            sum: [1, { mult: [{ sum: ['document_weight', -0.5] }, 0.4] }],
          },
        ],
      },
      defaults: { document_weight: 0.5 },
    });
  });

  it('flattens document groups round-robin and caps the caller limit', () => {
    const groups: Schemas['GroupsResult']['groups'] = [
      { id: 'doc-a', hits: [scoredPoint('a-1', 0.9), scoredPoint('a-2', 0.8)] },
      { id: 'doc-b', hits: [scoredPoint('b-1', 0.85), scoredPoint('b-2', 0.75)] },
    ];

    expect(flattenDocumentGroups(groups, 3).map(point => point.id)).toEqual(['a-1', 'b-1', 'a-2']);
  });
});

describe('native Qdrant search requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValue({ points: [] });
    mockQueryGroups.mockResolvedValue({ groups: [] });
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

  it('uses server-side RRF without Formula when boost is disabled', async () => {
    const queryText = 'Гибридный search query';

    await hybridSearchNative(queryText, createOptions());

    expect(mockQuery).toHaveBeenCalledWith(
      'course_embeddings',
      expect.objectContaining({
        prefetch: expect.arrayContaining([
          expect.objectContaining({
            query: createBm25Document(queryText),
            using: 'sparse',
          }),
          expect.objectContaining({
            query: [0.1, 0.2, 0.3],
            using: 'dense',
            score_threshold: 0.25,
          }),
        ]),
        query: { rrf: {} },
        limit: 5,
        with_payload: true,
      })
    );
    expect(mockQueryGroups).not.toHaveBeenCalled();
  });

  it('nests RRF inside the server-side Formula when boost is enabled', async () => {
    await hybridSearchNative(
      'priority query',
      createOptions({ enable_priority_boost: true, priority_boost_factor: 0.8 })
    );

    expect(mockQuery).toHaveBeenCalledWith(
      'course_embeddings',
      expect.objectContaining({
        prefetch: expect.objectContaining({
          prefetch: expect.any(Array),
          query: { rrf: {} },
          limit: 30,
        }),
        query: buildPriorityFormula(0.8),
        limit: 5,
      })
    );
  });

  it('groups hybrid results by document and flattens them round-robin', async () => {
    mockQueryGroups.mockResolvedValue({
      groups: [
        { id: 'doc-a', hits: [scoredPoint('a-1', 0.9), scoredPoint('a-2', 0.8)] },
        { id: 'doc-b', hits: [scoredPoint('b-1', 0.85), scoredPoint('b-2', 0.75)] },
      ],
    });

    const results = await hybridSearchNative(
      'grouped query',
      createOptions({ group_by_document: true, group_size: 2, limit: 3 })
    );

    expect(mockQueryGroups).toHaveBeenCalledWith(
      'course_embeddings',
      expect.objectContaining({
        query: { rrf: {} },
        group_by: 'document_id',
        group_size: 2,
        limit: 3,
        with_payload: true,
      })
    );
    expect(results.map(point => point.id)).toEqual(['a-1', 'b-1', 'a-2']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('uses Formula Query for explicitly boosted dense-only search', async () => {
    await denseSearch(
      'dense priority',
      createOptions({ enable_hybrid: false, enable_priority_boost: true })
    );

    expect(mockQuery).toHaveBeenCalledWith('course_embeddings', {
      prefetch: {
        query: [0.1, 0.2, 0.3],
        using: 'dense',
        filter: {
          must: [
            { key: 'organization_id', match: { value: 'organization-1' } },
            { key: 'course_id', match: { value: 'course-1' } },
          ],
        },
        score_threshold: 0.25,
        limit: 30,
      },
      query: buildPriorityFormula(0.4),
      limit: 5,
      with_payload: true,
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('reports dense fallback when native hybrid returns no points', async () => {
    const densePoint = scoredPoint('dense-1', 0.77);
    mockQuery.mockResolvedValue({ points: [] });
    mockSearch.mockResolvedValue([densePoint]);

    await expect(hybridSearchWithFallback('fallback query', createOptions())).resolves.toEqual({
      points: [densePoint],
      fallbackUsed: true,
    });
    expect(mockRecordHybridSearchOutcome).toHaveBeenCalledWith(true);
  });

  it('uses plain dense fallback when a boosted Formula hybrid request fails', async () => {
    const densePoint = scoredPoint('dense-safe', 0.71);
    mockQuery.mockRejectedValueOnce(new Error('formula request rejected'));
    mockSearch.mockResolvedValue([densePoint]);

    await expect(
      hybridSearchWithFallback(
        'boosted fallback query',
        createOptions({ enable_priority_boost: true })
      )
    ).resolves.toEqual({ points: [densePoint], fallbackUsed: true });

    expect(mockRecordHybridSearchOutcome).toHaveBeenCalledWith(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('records a successful native hybrid attempt without fallback', async () => {
    const hybridPoint = scoredPoint('hybrid-1', 0.91);
    mockQuery.mockResolvedValue({ points: [hybridPoint] });

    await expect(hybridSearchWithFallback('native query', createOptions())).resolves.toEqual({
      points: [hybridPoint],
      fallbackUsed: false,
    });

    expect(mockRecordHybridSearchOutcome).toHaveBeenCalledWith(false);
  });

  it('records one fallback decision when dense fallback also fails', async () => {
    mockQuery.mockResolvedValue({ points: [] });
    mockSearch.mockRejectedValue(new Error('dense unavailable'));

    await expect(hybridSearchWithFallback('failed fallback', createOptions())).rejects.toThrow(
      'dense unavailable'
    );

    expect(mockRecordHybridSearchOutcome).toHaveBeenCalledTimes(1);
    expect(mockRecordHybridSearchOutcome).toHaveBeenCalledWith(true);
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});

describe('search cache identity', () => {
  const filters: SearchFilters = { course_id: 'course-1', document_ids: ['b', 'a'] };

  it('distinguishes boost, factor, grouping, group size and alias', () => {
    const variants = [
      createOptions({ filters, enable_priority_boost: false }),
      createOptions({ filters, enable_priority_boost: true, priority_boost_factor: 0.4 }),
      createOptions({ filters, enable_priority_boost: true, priority_boost_factor: 0.8 }),
      createOptions({ filters, group_by_document: true, group_size: 2 }),
      createOptions({ filters, group_by_document: true, group_size: 3 }),
      createOptions({ filters, collection_name: 'course_embeddings_alt' }),
    ];

    expect(
      new Set(variants.map(options => generateSearchCacheKey('same query', options))).size
    ).toBe(variants.length);
    expect(filters.document_ids).toEqual(['b', 'a']);
  });

  it('distinguishes expansion and its budget, which change the text returned', () => {
    // Caught end-to-end on dev, not by the expansion unit tests: those never go
    // through the cache, so an expanded and an unexpanded search shared one
    // entry and whichever ran first won for the next five minutes.
    const plain = createOptions({ filters });
    const expanded = createOptions({ filters, expand_context: { max_tokens: 20_000 } });
    const narrower = createOptions({ filters, expand_context: { max_tokens: 5_000 } });

    const keys = [plain, expanded, narrower].map(options =>
      generateSearchCacheKey('same query', options)
    );

    expect(new Set(keys).size).toBe(3);
  });

  it('distinguishes payload shape and exact query text used by embeddings', () => {
    const base = createOptions({ include_payload: false });

    expect(generateSearchCacheKey('Exact Query', base)).not.toBe(
      generateSearchCacheKey('Exact Query', { ...base, include_payload: true })
    );
    expect(generateSearchCacheKey('Exact Query', base)).not.toBe(
      generateSearchCacheKey('exact query', base)
    );
    expect(generateSearchCacheKey('Exact Query', base)).not.toBe(
      generateSearchCacheKey('Exact Query ', base)
    );
  });
});
