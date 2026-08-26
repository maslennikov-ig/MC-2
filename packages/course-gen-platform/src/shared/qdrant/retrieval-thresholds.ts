/**
 * Retrieval score thresholds, in one place, with the measurement behind them.
 *
 * Every RAG entry point used to carry its own `0.7`. That number was never
 * reachable. Measured 2026-08-12 against the live production collection
 * (13712 points, 87 courses, Jina-v3 dense vectors, cosine distance):
 *
 *   'как выстроить систему KPI в отделе'        top-5 = 0.423   above 0.7: 0
 *   'управление командой и делегирование задач' top-5 = 0.513   above 0.7: 0
 *   'контент-маркетинг и работа с аудиторией'   top-5 = 0.580   above 0.7: 0
 *
 * and against a freshly indexed document whose text answers the query directly:
 *
 *   threshold 0.7 -> 0 hits, 0.5 -> 0 hits, 0.3 -> 4 hits (best 0.343)
 *
 * So the ceiling of what this embedding model actually produces on this corpus
 * sits near 0.6, and a 0.7 gate returns nothing on every query. Stage 6 had
 * already discovered this independently and tuned its own retrieval to 0.25;
 * that empirical value is now the shared default rather than a local exception.
 *
 * Two consequences worth keeping in mind when changing these numbers:
 *
 * 1. The threshold applies to **dense cosine scores only** — including the dense
 *    branch of a hybrid query, where it decides whether semantic candidates
 *    reach the fusion step at all. At 0.7 the dense branch was always empty, so
 *    "hybrid" search was silently BM25-only.
 * 2. It is never applied to a fused RRF score, and the reason is the opposite of
 *    what this comment used to give. It claimed RRF scores are ~1/(k+rank) and
 *    so live on a scale where 0.7 is unreachable. Measured 2026-08-26 against
 *    the live collection: Qdrant's fused scores reached **1.0000**, with the
 *    per-query best between 0.50 and 1.00, against dense cosine bests of 0.45
 *    to 0.65. The two ranges overlap, so a dense threshold applied to a fused
 *    score is not a harmless no-op — it silently cuts real results. Do not
 *    reuse this constant for one.
 *
 * ## Re-measured 2026-08-26 (`pnpm benchmark:rag`)
 *
 * 31 known-answer pairs plus 45 real Stage 6 objectives, over the live 6856-
 * point collection, at 0.15 / 0.20 / 0.25 / 0.30 / 0.35. Recall@5 did not move
 * at all between 0.15 and 0.30 on any of the three entry points. Above 0.30 the
 * dense-only path (`search_documents`) starts losing answers — recall@5 0.4839
 * to 0.4516 — and takes 9 of 76 queries to zero results. Both hybrid paths were
 * unaffected across the whole sweep, because the sparse branch keeps supplying
 * candidates when the dense gate closes.
 *
 * So 0.25 is not merely inherited any more: it is measured, and it sits in the
 * middle of a flat stretch with the nearest edge at 0.30. Both values below are
 * left where they are, deliberately.
 *
 * @module shared/qdrant/retrieval-thresholds
 */

/**
 * Default minimum dense cosine score for a chunk to be considered relevant.
 *
 * Measured and left unchanged, 2026-08-26. Recall@5 is identical at 0.15, 0.20,
 * 0.25 and 0.30 on all three entry points, so nothing is bought by moving
 * within that range and the first real cost appears at 0.35. It began as the
 * value Stage 6 arrived at empirically; it is now the middle of a measured flat
 * stretch.
 */
export const DENSE_SCORE_THRESHOLD = 0.25;

/**
 * Lower threshold for a widening retry, used when the default returns too
 * little to work with. Stage 6's two-tier retriever uses this same value.
 *
 * Measured and left unchanged, 2026-08-26: it is the bottom of the flat stretch
 * above, and widening to it costs nothing in precision on this corpus because
 * recall@5 is the same at both ends.
 */
export const DENSE_SCORE_THRESHOLD_WIDENED = 0.15;

/**
 * Highest dense score observed on real content, rounded up.
 *
 * This is not a knob. It is the measurement that makes any threshold above it
 * a guaranteed-empty search, and `retrieval-thresholds.test.ts` uses it to stop
 * an unreachable value from being introduced again.
 *
 * Raised from 0.6 on 2026-08-26. That figure came from three hand-run queries
 * in August and had been passed by the corpus since: over 760 dense scores from
 * 76 evaluation queries against the live collection, the highest was **0.6497**
 * and six of the 76 best-per-query scores were above 0.6. A ceiling below what
 * the embeddings demonstrably produce would have called a reachable threshold
 * unreachable. Nothing above 0.65 was seen, and nothing anywhere near 0.7.
 */
export const MAX_OBSERVED_DENSE_SCORE = 0.65;
