import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnrichedChunk } from '@/shared/embeddings/metadata-enricher';
import type { GroundTruthQuestion } from '@/shared/embeddings/retrieval-metrics';

const {
  mockCreateCollection,
  mockCreatePayloadIndex,
  mockDeleteCollection,
  mockUpsert,
  mockSearchChunks,
  mockGenerateEmbeddings,
} = vi.hoisted(() => ({
  mockCreateCollection: vi.fn(),
  mockCreatePayloadIndex: vi.fn(),
  mockDeleteCollection: vi.fn(),
  mockUpsert: vi.fn(),
  mockSearchChunks: vi.fn(),
  mockGenerateEmbeddings: vi.fn(),
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    createCollection: mockCreateCollection,
    createPayloadIndex: mockCreatePayloadIndex,
    deleteCollection: mockDeleteCollection,
    upsert: mockUpsert,
  },
}));

vi.mock('@/shared/qdrant/search', () => ({ searchChunks: mockSearchChunks }));

vi.mock('@/shared/embeddings/generate', () => ({
  generateEmbeddingsWithLateChunking: mockGenerateEmbeddings,
}));

vi.mock('@/shared/qdrant/upload-helpers', () => ({
  toQdrantPoint: (result: { chunk: { chunk_id: string } }) => ({ id: result.chunk.chunk_id }),
  toUpsertPoints: (points: unknown[]) => points,
}));

vi.mock('@/shared/logger/index', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function chunk(id: string, content: string, level: 'parent' | 'child'): EnrichedChunk {
  return { chunk_id: id, content, level, heading_path: 'Root' } as unknown as EnrichedChunk;
}

const CHUNKS = [
  chunk('p1', 'Раздел о точности целиком.', 'parent'),
  chunk('c1', 'Точность равна 98 процентов.', 'child'),
  chunk('c2', 'Не относится к вопросу.', 'child'),
];

const QUESTIONS: GroundTruthQuestion[] = [
  {
    id: 'q',
    query: 'какая точность',
    evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
  },
];

function hybridResponse(chunkIds: string[]) {
  return {
    results: chunkIds.map(chunk_id => ({ chunk_id })),
    metadata: { fallback_used: false, search_type: 'hybrid' },
  };
}

describe('evaluateDenseRetrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCollection.mockResolvedValue(undefined);
    mockCreatePayloadIndex.mockResolvedValue(undefined);
    mockDeleteCollection.mockResolvedValue(undefined);
    mockUpsert.mockResolvedValue(undefined);
    mockGenerateEmbeddings.mockResolvedValue({
      embeddings: CHUNKS.map(item => ({ chunk: item })),
      total_tokens: 1234,
      metadata: { chunk_count: 3, batch_count: 1, late_chunking_enabled: true },
    });
    mockSearchChunks.mockResolvedValue(hybridResponse(['c1', 'c2']));
  });

  it('embeds through the production call: one batch, every chunk, late chunking on', async () => {
    // The defect this pins: the first version split parents and children into
    // two calls with different `late_chunking` flags, following a helper's
    // docblock instead of `phase-5-embedding.ts`. Under late chunking the
    // request input IS the context, so that measured vectors production never
    // produces.
    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    await evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: 'bench_x' });

    expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(1);
    const [chunks, task, lateChunking] = mockGenerateEmbeddings.mock.calls[0];
    expect(chunks.map((item: EnrichedChunk) => item.chunk_id)).toEqual(['p1', 'c1', 'c2']);
    expect(task).toBe('retrieval.passage');
    expect(lateChunking).toBe(true);
  });

  it('scores only child chunks and reports the billed tokens', async () => {
    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    const result = await evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: 'bench_x' });

    expect(result.billedTokens).toBe(1234);
    expect(result.pointsUploaded).toBe(3);
    expect(result.report.questions[0].rankedChunkIds).toEqual(['c1', 'c2']);
    expect(result.report.atomCoverageAtK).toBe(1);
  });

  it('creates the payload indexes production filters need', async () => {
    // Without them, `unindexed_filtering_retrieve: false` rejects the filtered
    // query and hybrid search degrades to dense-only.
    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    await evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: 'bench_x' });

    expect(mockCreatePayloadIndex.mock.calls.length).toBeGreaterThan(0);
    expect(mockCreatePayloadIndex.mock.calls.every(([name]) => name === 'bench_x')).toBe(true);
  });

  it('fails the run instead of scoring a silent dense-only fallback', async () => {
    mockSearchChunks.mockResolvedValue({
      results: [{ chunk_id: 'c1' }],
      metadata: { fallback_used: true, search_type: 'dense' },
    });

    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    await expect(
      evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: 'bench_x' })
    ).rejects.toThrow(/degraded/u);
    expect(mockDeleteCollection).toHaveBeenCalledWith('bench_x');
  });

  it('drops the collection when payload indexing itself fails', async () => {
    // Index creation used to sit outside the `try`, so a failure there leaked
    // the temporary collection into the running Qdrant.
    mockCreatePayloadIndex.mockRejectedValueOnce(new Error('index refused'));

    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    await expect(
      evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: 'bench_x' })
    ).rejects.toThrow(/index refused/u);
    expect(mockDeleteCollection).toHaveBeenCalledWith('bench_x');
  });

  it('refuses the production alias outright', async () => {
    const { QDRANT_COLLECTION_ALIAS } = await import('@/shared/qdrant/config');
    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');

    await expect(
      evaluateDenseRetrieval(CHUNKS, QUESTIONS, { collectionName: QDRANT_COLLECTION_ALIAS })
    ).rejects.toThrow(/Refusing/u);
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  it('batches the upsert under the collection strict-mode cap', async () => {
    const many = Array.from({ length: 250 }, (_, index) =>
      chunk(`c${index}`, `фрагмент ${index}`, 'child')
    );
    mockGenerateEmbeddings.mockResolvedValue({
      embeddings: many.map(item => ({ chunk: item })),
      total_tokens: 10,
      metadata: { chunk_count: 250, batch_count: 1, late_chunking_enabled: true },
    });

    const { evaluateDenseRetrieval } = await import('@/shared/embeddings/dense-retrieval-eval');
    await evaluateDenseRetrieval(many, QUESTIONS, { collectionName: 'bench_x' });

    expect(mockUpsert).toHaveBeenCalledTimes(3);
    for (const [, payload] of mockUpsert.mock.calls) {
      expect(payload.points.length).toBeLessThanOrEqual(128);
    }
  });
});
