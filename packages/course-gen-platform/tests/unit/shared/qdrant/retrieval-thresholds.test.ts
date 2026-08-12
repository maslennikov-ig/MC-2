/**
 * Retrieval threshold reachability (mc2-pdmgu).
 *
 * Every RAG entry point carried its own hardcoded 0.7, a value the embeddings
 * never produce on this corpus, so those searches returned nothing and looked
 * like legitimate misses. Nothing failed, because nothing compared the
 * configured threshold against a measured score.
 *
 * These tests do that comparison. They are deliberately about the numbers
 * themselves rather than about search behaviour: the defect was a constant, and
 * a constant is what has to be pinned.
 */
import { describe, expect, it } from 'vitest';

import {
  DENSE_SCORE_THRESHOLD,
  DENSE_SCORE_THRESHOLD_WIDENED,
  MAX_OBSERVED_DENSE_SCORE,
} from '@/shared/qdrant/retrieval-thresholds';
import { LESSON_RAG_CONFIG, TWO_TIER_CONFIG } from '@/stages/stage6-lesson-content/rag/constants';

/**
 * Highest dense score seen for a query whose answer is verbatim in the corpus,
 * measured 2026-08-12 against production. Any threshold at or above this is a
 * search that cannot return anything.
 */
const BEST_MEASURED_RELEVANT_SCORE = 0.58;

/** Lowest score of a chunk that was genuinely relevant, same measurement. */
const WORST_MEASURED_RELEVANT_SCORE = 0.343;

describe('dense retrieval thresholds', () => {
  it('admits the weakest chunk that was actually relevant', () => {
    expect(DENSE_SCORE_THRESHOLD).toBeLessThan(WORST_MEASURED_RELEVANT_SCORE);
    expect(DENSE_SCORE_THRESHOLD_WIDENED).toBeLessThan(DENSE_SCORE_THRESHOLD);
  });

  it('stays below the best score the embeddings have ever produced', () => {
    // The exact failure being prevented: 0.7 > 0.58 means zero hits, always.
    expect(DENSE_SCORE_THRESHOLD).toBeLessThan(BEST_MEASURED_RELEVANT_SCORE);
    expect(MAX_OBSERVED_DENSE_SCORE).toBeGreaterThanOrEqual(BEST_MEASURED_RELEVANT_SCORE);
  });

  it('keeps a positive floor so an unrelated query can still return nothing', () => {
    // A threshold of 0 makes every search return its limit regardless of
    // relevance, which is the opposite failure and just as quiet.
    expect(DENSE_SCORE_THRESHOLD).toBeGreaterThan(0);
  });

  it('leaves the two-tier gate more permissive than full retrieval', () => {
    expect(TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD).toBeLessThan(LESSON_RAG_CONFIG.SCORE_THRESHOLD);
  });
});

describe('threshold consolidation', () => {
  it('routes the Stage 6 thresholds through the shared constant', () => {
    expect(LESSON_RAG_CONFIG.SCORE_THRESHOLD).toBe(DENSE_SCORE_THRESHOLD);
    expect(TWO_TIER_CONFIG.TIER1_SCORE_THRESHOLD).toBe(DENSE_SCORE_THRESHOLD_WIDENED);
  });

  it('leaves no unreachable threshold literal in the RAG source files', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files = [
      'src/shared/qdrant/search.ts',
      'src/stages/stage5-generation/utils/qdrant-search.ts',
      'src/stages/stage5-generation/utils/section-rag-retriever.ts',
      'src/stages/stage5-generation/evidence/advisory-enrichment.ts',
      'src/stages/stage6-lesson-content/rag/constants.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const assignments = [
        ...source.matchAll(/(?:score_threshold|SCORE_THRESHOLD)\s*[:=]\s*([\d.]+)/g),
      ];
      for (const [, literal] of assignments) {
        expect(
          Number(literal),
          `${file} sets a retrieval threshold of ${literal} as a literal; use the shared constant`
        ).toBeLessThan(MAX_OBSERVED_DENSE_SCORE);
      }
    }
  });
});
