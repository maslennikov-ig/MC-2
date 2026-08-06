import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedChunk } from '@/shared/embeddings/metadata-enricher';

const { mockCacheGet, mockCacheSet, mockLogger } = vi.hoisted(() => ({
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/cache/redis', () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

vi.mock('@/shared/embeddings/jina-client', () => ({
  jinaConcurrencyLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  },
  jinaRateLimiter: {
    waitForSlot: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/shared/logger', () => ({
  default: mockLogger,
  logger: mockLogger,
}));

function createChunk(content: string, tokenCount: number): EnrichedChunk {
  return {
    chunk_id: randomUUID(),
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child',
    content,
    token_count: tokenCount,
    char_count: content.length,
    chunk_index: 0,
    total_chunks: 1,
    chunk_strategy: 'semantic',
    overlap_tokens: 0,
    heading_path: 'Role Guide > Responsibilities',
    chapter: 'Role Guide',
    section: 'Responsibilities',
    document_id: randomUUID(),
    document_name: 'role-guide.md',
    document_version: '1.0',
    version_hash: 'test-hash',
    page_number: 1,
    page_range: [1, 1],
    has_code: false,
    has_formulas: false,
    has_tables: false,
    has_images: false,
    organization_id: randomUUID(),
    course_id: randomUUID(),
    indexed_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    image_refs: [],
    table_refs: [],
  };
}

function createJinaResponse(count: number) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: Array.from({ length: count }, (_, index) => ({
        index,
        embedding: Array.from({ length: 768 }, () => 0.01),
      })),
      usage: {
        total_tokens: 100,
      },
    }),
  };
}

function createJinaLateChunkingWindowError() {
  return {
    ok: false,
    status: 422,
    json: vi.fn().mockResolvedValue({
      detail: {
        message:
          'Inputs at indices [2, 3] could not be tokenized for late_chunking (empty, whitespace-only, or beyond the truncation window). Remove them and retry, or split into smaller batches.',
      },
    }),
  };
}

describe('generateEmbeddingsWithLateChunking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JINA_API_KEY = 'test-jina-key';
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(true);
  });

  it('sends provider-side truncation for late-chunking batches near the token limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJinaResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunk = createChunk('word '.repeat(6_500), 7_784);

    const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage', true);

    expect(result.embeddings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit.body));

    expect(payload).toMatchObject({
      model: 'jina-embeddings-v3',
      task: 'retrieval.passage',
      dimensions: 768,
      late_chunking: true,
      truncate: true,
    });
    expect(payload.input).toHaveLength(1);
  });

  it('preserves token-aware splitting and sends truncation on each split request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJinaResponse(1))
      .mockResolvedValueOnce(createJinaResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunks = [
      createChunk('first '.repeat(4_500), 5_000),
      createChunk('second '.repeat(4_500), 5_000),
    ];

    const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true);

    expect(result.embeddings).toHaveLength(2);
    expect(result.metadata.batch_count).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const call of fetchMock.mock.calls) {
      const [, requestInit] = call;
      const payload = JSON.parse(String(requestInit.body));

      expect(payload).toMatchObject({
        late_chunking: true,
        truncate: true,
      });
      expect(payload.input).toHaveLength(1);
    }
  });

  it('splits and retries late-chunking batches that exceed Jina truncation window', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJinaLateChunkingWindowError())
      .mockResolvedValueOnce(createJinaResponse(2))
      .mockResolvedValueOnce(createJinaResponse(2));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunks = [
      createChunk('first '.repeat(1_000), 1_500),
      createChunk('second '.repeat(1_000), 1_500),
      createChunk('third '.repeat(1_000), 1_500),
      createChunk('fourth '.repeat(1_000), 1_500),
    ];

    const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true);

    expect(result.embeddings).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const thirdPayload = JSON.parse(String(fetchMock.mock.calls[2][1].body));

    expect(firstPayload.input).toHaveLength(4);
    expect(secondPayload.input).toHaveLength(2);
    expect(thirdPayload.input).toHaveLength(2);
    expect(secondPayload).toMatchObject({ late_chunking: true, truncate: true });
    expect(thirdPayload).toMatchObject({ late_chunking: true, truncate: true });
  });
});

describe('embedding cache identity', () => {
  const vector = () => Array.from({ length: 768 }, () => 0.02);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JINA_API_KEY = 'test-jina-key';
    mockCacheSet.mockResolvedValue(true);
  });

  it('refuses a partial late-chunking cache hit and re-embeds the whole batch', async () => {
    // Late chunking makes a vector a function of the WHOLE request input: Jina
    // concatenates the batch, embeds it as one context and splits afterwards.
    // Serving one cached vector and re-embedding the rest would build a
    // collection out of vectors that never shared a context.
    mockCacheGet.mockResolvedValueOnce(vector()).mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(createJinaResponse(2));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunks = [createChunk('first chunk text', 10), createChunk('second chunk text', 10)];

    await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.input).toEqual(['first chunk text', 'second chunk text']);
  });

  it('reuses a late-chunking batch only when the whole batch is cached', async () => {
    mockCacheGet.mockResolvedValue(vector());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunks = [createChunk('first chunk text', 10), createChunk('second chunk text', 10)];

    const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.total_tokens).toBe(0);
    expect(result.embeddings).toHaveLength(2);
  });

  it('keeps per-text reuse when late chunking is off', async () => {
    // Without late chunking each text is embedded independently, so a partial
    // hit is sound and only the misses are sent.
    mockCacheGet.mockResolvedValueOnce(vector()).mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(createJinaResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunks = [createChunk('first chunk text', 10), createChunk('second chunk text', 10)];

    await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', false);

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.input).toEqual(['second chunk text']);
    expect(payload.late_chunking).toBe(false);
  });

  it('does not read a late-chunking vector back for a plain request', async () => {
    mockCacheGet.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(createJinaResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddingsWithLateChunking } = await import('@/shared/embeddings/generate');
    const chunk = createChunk('shared text', 10);

    await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage', true);
    await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage', false);

    const [lateKey] = mockCacheSet.mock.calls[0];
    const [plainKey] = mockCacheSet.mock.calls[1];
    expect(lateKey).not.toBe(plainKey);
  });
});
