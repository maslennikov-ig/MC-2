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
 * 2. It is never applied to a fused RRF score. RRF scores are ~1/(k+rank) and
 *    live on a different scale entirely, where 0.7 is unreachable by
 *    construction. Do not reuse this constant for one.
 *
 * @module shared/qdrant/retrieval-thresholds
 */

/**
 * Default minimum dense cosine score for a chunk to be considered relevant.
 *
 * Matches the value Stage 6 arrived at empirically.
 */
export const DENSE_SCORE_THRESHOLD = 0.25;

/**
 * Lower threshold for a widening retry, used when the default returns too
 * little to work with. Stage 6's two-tier retriever uses this same value.
 */
export const DENSE_SCORE_THRESHOLD_WIDENED = 0.15;

/**
 * Highest dense score observed on real content, rounded up.
 *
 * This is not a knob. It is the measurement that makes any threshold above it
 * a guaranteed-empty search, and `retrieval-thresholds.test.ts` uses it to stop
 * an unreachable value from being introduced again.
 */
export const MAX_OBSERVED_DENSE_SCORE = 0.6;
