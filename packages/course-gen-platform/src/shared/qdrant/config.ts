export const QDRANT_COLLECTION_ALIAS =
  process.env.QDRANT_COLLECTION_NAME?.trim() || 'course_embeddings';
export const QDRANT_PHYSICAL_COLLECTION =
  process.env.QDRANT_PHYSICAL_COLLECTION_NAME?.trim() || 'course_embeddings_v1';

export const QDRANT_BM25_OPTIONS = {
  language: 'none',
  tokenizer: 'multilingual',
  lowercase: true,
  k: 1.2,
  b: 0.75,
  avg_len: 256,
} as const;

export function createBm25Document(text: string) {
  return { text, model: 'qdrant/bm25' as const, options: QDRANT_BM25_OPTIONS };
}
