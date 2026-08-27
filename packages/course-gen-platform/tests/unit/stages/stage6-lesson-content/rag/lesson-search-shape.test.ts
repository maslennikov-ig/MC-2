/**
 * What Stage 6 asks Qdrant for, and the measurement behind each part of it.
 *
 * Lesson retrieval used to group by document with `group_size: 2`, to stop one
 * uploaded file from filling a lesson's context. Measured 2026-08-26/27 against
 * the live collection with `pnpm benchmark:rag`, and the cap was paying for
 * something it did not deliver:
 *
 *   recall@5   grouping on 0.7419   grouping off 0.9677
 *   MRR        grouping on 0.6237   grouping off 0.7774
 *   candidates 6.25 per query       29.97 per query
 *
 * The diversity it bought, counted over a whole lesson's query set rather than
 * one query — which is the unit that can actually be dominated, since Stage 6
 * keeps the union of up to ten queries:
 *
 *   documents per lesson   grouping on 1.78   grouping off 1.67
 *   single-document lessons        6 of 9             6 of 9
 *
 * 0.11 documents per lesson, for 22.6 points of recall. One document already
 * supplied the whole context in two lessons out of three WITH the cap in force,
 * because these courses do not hold several documents bearing on one lesson.
 * The cap was also starving the reranker, which fetches four candidates per kept
 * chunk and was receiving fewer candidates than the seven chunks it selects.
 *
 * Grouping stays where it earns its keep: Stage 4 evidence preflight, conflict
 * detection and Stage 5 advisory enrichment all group deliberately, because
 * their job is per-document coverage rather than the single best passage.
 *
 * Run against the pre-change builder, the first assertion below failed with
 * `expected true to be false`.
 */
import { describe, expect, it } from 'vitest';

import { buildLessonSearchOptions } from '@/stages/stage6-lesson-content/rag/search-options';
import { LESSON_RAG_CONFIG } from '@/stages/stage6-lesson-content/rag/constants';

const BASE = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  courseId: '22222222-2222-4222-8222-222222222222',
  queryCount: 1,
};

describe('the request Stage 6 lesson retrieval issues', () => {
  it('does not cap results per document', () => {
    const options = buildLessonSearchOptions(BASE);
    expect(options.group_by_document).toBe(false);
    // With grouping off, `group_size` is configuration that nothing reads.
    expect(options.group_size).toBeUndefined();
  });

  it('still asks for hybrid and for the priority boost', () => {
    // Neither was implicated: the sparse branch contributes more unique accepted
    // results than the dense one here, and the boost costs nothing measurable
    // once grouping is off (MRR 0.7774 against 0.7952).
    const options = buildLessonSearchOptions(BASE);
    expect(options.enable_hybrid).toBe(LESSON_RAG_CONFIG.ENABLE_HYBRID);
    expect(options.enable_priority_boost).toBe(true);
  });

  it('keeps the tenant and course scope on every request', () => {
    const options = buildLessonSearchOptions(BASE);
    expect(options.filters?.organization_id).toBe(BASE.organizationId);
    expect(options.filters?.course_id).toBe(BASE.courseId);
  });

  it('narrows to the lesson documents only when the run named some', () => {
    expect(buildLessonSearchOptions(BASE).filters?.document_ids).toBeUndefined();
    expect(
      buildLessonSearchOptions({ ...BASE, primaryDocumentIds: ['doc-a'] }).filters?.document_ids
    ).toEqual(['doc-a']);
  });
});
