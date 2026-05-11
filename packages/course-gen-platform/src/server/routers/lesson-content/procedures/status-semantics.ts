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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildApprovalMetadata(
  metadata: unknown,
  approval: { approvedAt: string; approvedBy: string }
): Record<string, unknown> {
  const base = isRecord(metadata) ? { ...metadata } : {};
  const reviewInfo = isRecord(base.reviewInfo) ? base.reviewInfo : null;

  return {
    ...base,
    approved_at: approval.approvedAt,
    approved_by: approval.approvedBy,
    ...(reviewInfo
      ? {
          reviewInfo: {
            ...reviewInfo,
            needsReview: false,
            resolvedByApproval: true,
            resolved_at: approval.approvedAt,
            resolved_by: approval.approvedBy,
          },
        }
      : {}),
  };
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
