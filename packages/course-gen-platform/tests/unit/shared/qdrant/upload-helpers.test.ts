import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddingResult } from '@/shared/embeddings/generate';
import type { EnrichedChunk } from '@/shared/embeddings/metadata-enricher';
import { toQdrantPayload } from '@/shared/embeddings/metadata-enricher';
import { createBm25Document } from '@/shared/qdrant/config';
import { toQdrantPoint } from '@/shared/qdrant/upload-helpers';

const { mockQdrantUpsert, mockLogger } = vi.hoisted(() => ({
  mockQdrantUpsert: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    upsert: mockQdrantUpsert,
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

function createChunk(overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  return {
    chunk_id: 'chunk-1',
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child',
    content: 'Пример multilingual course content',
    token_count: 4,
    char_count: 35,
    chunk_index: 0,
    total_chunks: 1,
    chunk_strategy: 'semantic',
    overlap_tokens: 0,
    heading_path: 'Chapter > Section',
    chapter: '',
    section: null,
    document_id: 'document-1',
    document_name: 'course.pdf',
    document_version: null,
    version_hash: undefined,
    page_number: 0,
    page_range: null,
    has_code: false,
    has_formulas: false,
    has_tables: false,
    has_images: false,
    organization_id: 'organization-1',
    course_id: 'course-1',
    indexed_at: '2026-07-10T00:00:00.000Z',
    last_updated: '2026-07-10T00:00:00.000Z',
    image_refs: [],
    table_refs: [],
    document_priority: 'CORE',
    document_weight: 1,
    ...overrides,
  };
}

function createEmbedding(chunk: EnrichedChunk): EmbeddingResult {
  return {
    chunk,
    dense_vector: [0.1, 0.2, 0.3],
    token_count: chunk.token_count,
  };
}

describe('Qdrant upload conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the native BM25 document and complete compacted enriched payload', () => {
    const chunk = createChunk();

    const point = toQdrantPoint(createEmbedding(chunk), true);
    const expectedPayload = Object.fromEntries(
      Object.entries(toQdrantPayload(chunk)).filter(
        ([, value]) => value !== null && value !== undefined
      )
    );

    expect(point.vector.sparse).toEqual(createBm25Document(chunk.content));
    expect(point.payload).toEqual(expectedPayload);
    expect(point.payload).toMatchObject({
      document_priority: 'CORE',
      document_weight: 1,
      organization_id: chunk.organization_id,
      course_id: chunk.course_id,
      document_id: chunk.document_id,
      chunk_id: chunk.chunk_id,
      chapter: '',
      page_number: 0,
      has_code: false,
    });
    expect(Object.values(point.payload)).not.toContain(undefined);
    expect(Object.values(point.payload)).not.toContain(null);
  });

  it('creates independent native BM25 documents without accumulating corpus state', () => {
    const firstChunk = createChunk({ chunk_id: 'chunk-1', content: 'Первый документ' });
    const secondChunk = createChunk({ chunk_id: 'chunk-2', content: 'Second document' });

    const firstPoint = toQdrantPoint(createEmbedding(firstChunk), true);
    const firstDocumentSnapshot = structuredClone(firstPoint.vector.sparse);
    const secondPoint = toQdrantPoint(createEmbedding(secondChunk), true);

    expect(firstPoint.vector.sparse).toEqual(firstDocumentSnapshot);
    expect(firstPoint.vector.sparse).toEqual(createBm25Document(firstChunk.content));
    expect(secondPoint.vector.sparse).toEqual(createBm25Document(secondChunk.content));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.49, 1.01, '1'])(
    'rejects invalid document_weight %s before storage',
    invalidWeight => {
      const chunk = createChunk({ document_weight: invalidWeight as number });

      expect(() => toQdrantPoint(createEmbedding(chunk), true)).toThrow(
        'document_weight must be a finite number between 0.5 and 1.0'
      );
    }
  );

  it('omits missing document_weight so the query default can apply', () => {
    const chunk = createChunk({ document_weight: undefined as unknown as number });

    const point = toQdrantPoint(createEmbedding(chunk), true);

    expect(point.payload).not.toHaveProperty('document_weight');
  });

  it.each([0.5, 1])('accepts document_weight boundary %s', documentWeight => {
    const chunk = createChunk({ document_weight: documentWeight });

    const point = toQdrantPoint(createEmbedding(chunk), true);

    expect(point.payload.document_weight).toBe(documentWeight);
  });

  it('rejects a later invalid input before any Qdrant upsert', async () => {
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalSupabaseKey = process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;

    try {
      const { uploadChunksToQdrant } = await import('@/shared/qdrant/upload');
      const validFirst = createEmbedding(
        createChunk({ chunk_id: 'chunk-valid', document_weight: 0.5 })
      );
      const invalidSecond = createEmbedding(
        createChunk({ chunk_id: 'chunk-invalid', document_weight: 1.01 })
      );

      await expect(
        uploadChunksToQdrant([validFirst, invalidSecond], {
          batch_size: 1,
          enable_sparse: true,
        })
      ).rejects.toThrow('document_weight must be a finite number between 0.5 and 1.0');
      expect(mockQdrantUpsert).not.toHaveBeenCalled();
    } finally {
      process.env.SUPABASE_URL = originalSupabaseUrl;
      process.env.SUPABASE_SERVICE_KEY = originalSupabaseKey;
    }
  });
});
