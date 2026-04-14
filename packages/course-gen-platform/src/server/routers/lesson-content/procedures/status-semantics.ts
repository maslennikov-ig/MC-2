export const APPROVABLE_LESSON_CONTENT_STATUSES = ['completed', 'review_required'] as const;

export type LessonProgressStatus = 'completed' | 'approved' | 'failed' | 'generating' | 'pending';

export type LessonProgressSemantics = {
  status: LessonProgressStatus;
  contentStatus: string | null;
  needsReview: boolean;
  countsAsReady: boolean;
};

export function buildSupabaseInFilterValue(values: readonly string[]): string {
  return `(${values.map(value => `"${value}"`).join(',')})`;
}

export function getLessonProgressSemantics(
  contentStatus: string | null | undefined
): LessonProgressSemantics {
  switch (contentStatus) {
    case 'completed':
      return {
        status: 'completed',
        contentStatus,
        needsReview: false,
        countsAsReady: true,
      };
    case 'approved':
      return {
        status: 'approved',
        contentStatus,
        needsReview: false,
        countsAsReady: true,
      };
    case 'review_required':
      return {
        status: 'completed',
        contentStatus,
        needsReview: true,
        countsAsReady: true,
      };
    case 'failed':
      return {
        status: 'failed',
        contentStatus,
        needsReview: false,
        countsAsReady: false,
      };
    case 'generating':
      return {
        status: 'generating',
        contentStatus,
        needsReview: false,
        countsAsReady: false,
      };
    default:
      return {
        status: 'pending',
        contentStatus: contentStatus ?? null,
        needsReview: false,
        countsAsReady: false,
      };
  }
}
