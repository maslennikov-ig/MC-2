/**
 * Shared utility for building RAG fallback search queries from section metadata.
 *
 * Used by both v2-converter.ts and phase3-v2-spec-generator.ts to generate
 * section-specific search queries when document_relevance_mapping is empty.
 *
 * @module stages/stage5-generation/utils/rag-fallback-queries
 */

import type { SectionBreakdown } from '@megacampus/shared-types/analysis-result';

/**
 * Build fallback search queries from section breakdown metadata.
 *
 * When `document_relevance_mapping` is empty (always for new courses since mc2-u9fb),
 * this function generates section-specific queries using the section's area and key topics.
 *
 * @param sectionBreakdown - Section metadata from analysis result (may be undefined)
 * @param topic - Course topic from `topic_analysis.determined_topic` (fallback: 'course')
 * @param sectionId - Section identifier (number or string)
 * @returns Array of 1-4 search queries, most specific first
 *
 * @example
 * ```typescript
 * // With section breakdown available
 * buildFallbackSearchQueries(
 *   { area: 'Machine Learning', key_topics: ['supervised', 'unsupervised', 'neural nets'] },
 *   'Data Science', 1
 * )
 * // → ['Machine Learning', 'supervised', 'unsupervised', 'neural nets']
 *
 * // Without section breakdown
 * buildFallbackSearchQueries(undefined, 'Data Science', 1)
 * // → ['Data Science section 1']
 * ```
 */
export function buildFallbackSearchQueries(
  sectionBreakdown: SectionBreakdown | undefined,
  topic: string,
  sectionId: string | number,
): string[] {
  if (sectionBreakdown) {
    return [sectionBreakdown.area, ...sectionBreakdown.key_topics.slice(0, 3)];
  }

  return [`${topic || 'course'} section ${sectionId}`];
}
