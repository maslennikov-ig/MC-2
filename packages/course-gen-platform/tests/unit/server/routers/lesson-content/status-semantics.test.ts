import { describe, expect, it } from 'vitest';
import {
  APPROVABLE_LESSON_CONTENT_STATUSES,
  buildSupabaseInFilterValue,
  getLessonProgressSemantics,
} from '../../../../../src/server/routers/lesson-content/procedures/status-semantics';

describe('lesson content status semantics', () => {
  it('treats review_required as approvable in batch approval flows', () => {
    expect(APPROVABLE_LESSON_CONTENT_STATUSES).toEqual(['completed', 'review_required']);
    expect(buildSupabaseInFilterValue(APPROVABLE_LESSON_CONTENT_STATUSES)).toBe(
      '("completed","review_required")'
    );
  });

  it('maps review_required to completed progress with review flag', () => {
    expect(getLessonProgressSemantics('review_required')).toEqual({
      status: 'completed',
      contentStatus: 'review_required',
      needsReview: true,
      countsAsReady: true,
    });
  });

  it('maps approved to ready progress without review flag', () => {
    expect(getLessonProgressSemantics('approved')).toEqual({
      status: 'approved',
      contentStatus: 'approved',
      needsReview: false,
      countsAsReady: true,
    });
  });

  it('keeps failed and generating statuses unchanged', () => {
    expect(getLessonProgressSemantics('failed')).toEqual({
      status: 'failed',
      contentStatus: 'failed',
      needsReview: false,
      countsAsReady: false,
    });

    expect(getLessonProgressSemantics('generating')).toEqual({
      status: 'generating',
      contentStatus: 'generating',
      needsReview: false,
      countsAsReady: false,
    });
  });

  it('falls back unknown statuses to pending semantics', () => {
    expect(getLessonProgressSemantics('pending')).toEqual({
      status: 'pending',
      contentStatus: 'pending',
      needsReview: false,
      countsAsReady: false,
    });

    expect(getLessonProgressSemantics(null)).toEqual({
      status: 'pending',
      contentStatus: null,
      needsReview: false,
      countsAsReady: false,
    });
  });
});
