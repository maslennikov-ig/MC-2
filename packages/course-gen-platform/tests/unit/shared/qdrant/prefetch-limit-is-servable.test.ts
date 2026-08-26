/**
 * A hybrid request the collection will refuse is not a hybrid request.
 *
 * Measured 2026-08-26 against the live collection: `strict_mode_config` sets
 * `max_query_limit: 100`, and that ceiling applies to a PREFETCH limit as well
 * as to the outer one. `getPrefetchLimit` asked for three times the caller's
 * limit with no ceiling, so Stage 5 section retrieval — which sizes its per-
 * query limit as `25 * 4 / queryCount` — sent a prefetch limit of 300, 150 or
 * 102 whenever a section's RAG plan carried 1, 2 or 3 search queries. Qdrant
 * answered `Bad Request`, `hybridSearchWithFallback` caught it, and the search
 * ran dense-only. Confirmed end to end through `searchChunks`:
 *
 *   queries=1  caller limit 100  prefetch 300  ->  fallback, dense-only
 *   queries=2  caller limit  50  prefetch 150  ->  fallback, dense-only
 *   queries=3  caller limit  34  prefetch 102  ->  fallback, dense-only
 *   queries=4  caller limit  25  prefetch  75  ->  hybrid
 *   queries=5  caller limit  20  prefetch  60  ->  hybrid
 *
 * This is the same shape of failure as the unreachable 0.7 threshold: the call
 * says hybrid, the log says hybrid, `search_type` says hybrid, and only
 * `fallback_used` and a warn line say otherwise. The difference is that this
 * one is arithmetic, so it can be pinned here without a live collection.
 *
 * These tests were run against the pre-fix `getPrefetchLimit` and failed:
 * "servable prefetch limit ... expected 300 to be less than or equal to 100"
 * and the Stage 5 case likewise at 300/150/102.
 */
import { describe, expect, it } from 'vitest';

import { STRICT_MODE_MAX_QUERY_LIMIT, getPrefetchLimit } from '@/shared/qdrant/search-operations';
import {
  SECTION_RAG_DEFAULTS,
  sectionCandidateLimit,
} from '@/stages/stage5-generation/utils/section-search-options';
import { lessonCandidateLimit } from '@/stages/stage6-lesson-content/rag/search-options';
import { COLLECTION_CREATE_PARAMS } from '@/shared/qdrant/collection-schema';

describe('prefetch limit against the collection that has to serve it', () => {
  it('takes its ceiling from the schema the collection is created with', () => {
    // Not a second copy of 100: the schema is the thing in force, so if the
    // collection's strict mode is ever raised or lowered, this constant is
    // wrong rather than merely stale.
    expect(STRICT_MODE_MAX_QUERY_LIMIT).toBe(
      COLLECTION_CREATE_PARAMS.strict_mode_config.max_query_limit
    );
  });

  it('never asks for a servable prefetch limit above the ceiling', () => {
    for (const callerLimit of [1, 10, 25, 30, 34, 50, 100]) {
      expect(getPrefetchLimit(callerLimit)).toBeLessThanOrEqual(STRICT_MODE_MAX_QUERY_LIMIT);
    }
  });

  it('still gives RRF a deeper pool than the caller asked for, where it can', () => {
    // The clamp must not quietly become "prefetch == limit" for everyone; the
    // multiplier is the reason hybrid ranking sees more than the top slice.
    expect(getPrefetchLimit(10)).toBeGreaterThan(10);
    expect(getPrefetchLimit(25)).toBeGreaterThan(25);
  });

  it('keeps Stage 5 hybrid for every section plan size, including one query', () => {
    for (let queryCount = 1; queryCount <= 10; queryCount += 1) {
      const callerLimit = sectionCandidateLimit(SECTION_RAG_DEFAULTS.TARGET_CHUNKS, queryCount);
      expect(callerLimit).toBeLessThanOrEqual(STRICT_MODE_MAX_QUERY_LIMIT);
      expect(getPrefetchLimit(callerLimit)).toBeLessThanOrEqual(STRICT_MODE_MAX_QUERY_LIMIT);
    }
  });

  it('keeps Stage 6 hybrid for every lesson query count', () => {
    for (let queryCount = 1; queryCount <= 10; queryCount += 1) {
      const callerLimit = lessonCandidateLimit(7, queryCount);
      expect(callerLimit).toBeLessThanOrEqual(STRICT_MODE_MAX_QUERY_LIMIT);
      expect(getPrefetchLimit(callerLimit)).toBeLessThanOrEqual(STRICT_MODE_MAX_QUERY_LIMIT);
    }
  });
});
