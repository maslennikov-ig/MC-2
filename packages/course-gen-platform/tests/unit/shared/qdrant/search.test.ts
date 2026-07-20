import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QdrantScoredPoint } from '@/shared/qdrant/types';

const { mockCacheGet, mockCacheSet, mockDenseSearch, mockHybridSearchWithFallback, mockLogger } =
  vi.hoisted(() => ({
    mockCacheGet: vi.fn(),
    mockCacheSet: vi.fn(),
    mockDenseSearch: vi.fn(),
    mockHybridSearchWithFallback: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));

vi.mock('@/shared/cache/redis', () => ({
  cache: { get: mockCacheGet, set: mockCacheSet },
}));

vi.mock('@/shared/qdrant/search-operations', () => ({
  denseSearch: mockDenseSearch,
  hybridSearchWithFallback: mockHybridSearchWithFallback,
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

function point(score = 0.9): QdrantScoredPoint {
  return {
    id: 'chunk-1',
    version: 1,
    score,
    payload: {
      chunk_id: 'chunk-1',
      level: 'child',
      content: 'content',
      heading_path: 'chapter',
      document_id: 'doc-1',
      document_name: 'Document',
      token_count: 3,
      document_weight: 1,
    },
  };
}

describe('searchChunks server-side ranking metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockDenseSearch.mockResolvedValue([]);
  });

  it('preserves the Qdrant Formula score instead of mutating it client-side', async () => {
    const rankedPoint = point(0.9);
    mockHybridSearchWithFallback.mockResolvedValue({
      points: [rankedPoint],
      fallbackUsed: false,
    });
    const { searchChunks } = await import('@/shared/qdrant/search');

    const response = await searchChunks('priority query', {
      enable_hybrid: true,
      enable_priority_boost: true,
      priority_boost_factor: 0.4,
    });

    expect(response.results[0].score).toBe(0.9);
    expect(rankedPoint.score).toBe(0.9);
    expect(response.metadata.fallback_used).toBe(false);
  });

  it('exposes hybrid fallback in response metadata', async () => {
    mockHybridSearchWithFallback.mockResolvedValue({
      points: [point(0.75)],
      fallbackUsed: true,
    });
    const { searchChunks } = await import('@/shared/qdrant/search');

    const response = await searchChunks('fallback query', { enable_hybrid: true });

    expect(response.metadata.fallback_used).toBe(true);
  });
});
