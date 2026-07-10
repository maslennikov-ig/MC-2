import { describe, expect, it } from 'vitest';
import {
  COLLECTION_CREATE_PARAMS,
  PAYLOAD_INDEXES,
} from '../../../../src/shared/qdrant/collection-schema';
import { createBm25Document } from '../../../../src/shared/qdrant/config';

describe('self-hosted Qdrant schema', () => {
  it('uses native BM25 with IDF and multilingual no-stemming options', () => {
    expect(COLLECTION_CREATE_PARAMS.sparse_vectors.sparse.modifier).toBe('idf');
    expect(createBm25Document('Пример text')).toEqual({
      text: 'Пример text',
      model: 'qdrant/bm25',
      options: {
        language: 'none',
        tokenizer: 'multilingual',
        lowercase: true,
        k: 1.2,
        b: 0.75,
        avg_len: 256,
      },
    });
  });

  it('keeps the approved dense and sparse vector configuration in memory', () => {
    expect(COLLECTION_CREATE_PARAMS).toMatchObject({
      vectors: {
        dense: {
          size: 768,
          distance: 'Cosine',
          hnsw_config: { m: 16, ef_construct: 100 },
          on_disk: false,
        },
      },
      sparse_vectors: {
        sparse: {
          index: { on_disk: false },
          modifier: 'idf',
        },
      },
      shard_number: 1,
      replication_factor: 1,
      write_consistency_factor: 1,
      optimizers_config: { indexing_threshold: 20000 },
    });
  });

  it('indexes every field required by filters, grouping, and strict Formula Query', () => {
    expect(PAYLOAD_INDEXES).toEqual([
      {
        field_name: 'organization_id',
        field_schema: { type: 'keyword', is_tenant: true },
      },
      { field_name: 'course_id', field_schema: 'keyword' },
      { field_name: 'document_id', field_schema: 'keyword' },
      { field_name: 'chunk_id', field_schema: 'keyword' },
      { field_name: 'level', field_schema: 'keyword' },
      { field_name: 'chapter', field_schema: 'keyword' },
      { field_name: 'section', field_schema: 'keyword' },
      { field_name: 'has_code', field_schema: 'bool' },
      { field_name: 'has_formulas', field_schema: 'bool' },
      { field_name: 'has_tables', field_schema: 'bool' },
      { field_name: 'has_images', field_schema: 'bool' },
      { field_name: 'document_weight', field_schema: 'float' },
    ]);
  });

  it('applies every approved strict-mode safety limit', () => {
    expect(COLLECTION_CREATE_PARAMS.strict_mode_config).toEqual({
      enabled: true,
      unindexed_filtering_retrieve: false,
      unindexed_filtering_update: false,
      max_query_limit: 100,
      max_timeout: 120,
      upsert_max_batchsize: 128,
      search_max_batchsize: 64,
      filter_max_conditions: 16,
      condition_max_size: 256,
      max_payload_index_count: 16,
      max_resident_memory_percent: 90,
    });
  });
});
