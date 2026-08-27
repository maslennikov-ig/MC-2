export const QDRANT_COLLECTION_ALIAS =
  process.env.QDRANT_COLLECTION_NAME?.trim() || 'course_embeddings';
export const QDRANT_PHYSICAL_COLLECTION =
  process.env.QDRANT_PHYSICAL_COLLECTION_NAME?.trim() || 'course_embeddings_v1';

/**
 * BM25 parameters, measured and left unchanged 2026-08-26.
 *
 * The question these had to answer was whether the sparse branch earns its
 * place, because a branch that runs and never contributes a unique accepted
 * result is a branch doing no work — and no metric in this repository can
 * report that. Branch attribution over 76 queries against the live collection:
 * the sparse branch supplied **1813 uniquely-sparse accepted results across
 * 71 of 76 queries** at the Stage 5 entry point, against 2086 uniquely-dense
 * across 70. The two halves are close to balanced, so there is no imbalance for
 * `k`, `b` or `avg_len` to correct.
 *
 * `avg_len` is worth a second look if the corpus is ever rebuilt: it is set to
 * 256 while the live collection's mean chunk is 330 tokens (median 348). BM25
 * uses it only to normalise length, and the measurement above says the branch
 * is healthy as it stands, so it is recorded rather than changed.
 */
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
