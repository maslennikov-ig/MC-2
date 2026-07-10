import type { Schemas } from '@qdrant/js-client-rest';

export const COLLECTION_CREATE_PARAMS = {
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
  strict_mode_config: {
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
  },
} as const satisfies Schemas['CreateCollection'];

export const PAYLOAD_INDEXES = [
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
] as const satisfies readonly Schemas['CreateFieldIndex'][];
