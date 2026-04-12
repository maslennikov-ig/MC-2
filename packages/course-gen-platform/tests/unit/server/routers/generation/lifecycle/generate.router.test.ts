import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { RequiredRagUnavailableError } from '@/shared/rag/document-availability';

const {
  mockAddJob,
  mockAssertCourseAccess,
  mockBuildDocumentSummaries,
  mockCheckConcurrencyLimits,
  mockExtractTierFromOrg,
  mockGetSupabaseAdmin,
  mockLogger,
  mockThrowOnSupabaseError,
} = vi.hoisted(() => ({
  mockAddJob: vi.fn(),
  mockAssertCourseAccess: vi.fn(),
  mockBuildDocumentSummaries: vi.fn(),
  mockCheckConcurrencyLimits: vi.fn(),
  mockExtractTierFromOrg: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockThrowOnSupabaseError: vi.fn(),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockGetSupabaseAdmin()),
}));

vi.mock('@/orchestrator/queue', () => ({
  addJob: vi.fn((...args) => mockAddJob(...args)),
}));

vi.mock('@/server/middleware/rate-limit.js', () => ({
  createRateLimiter: () => vi.fn(({ next }) => next()),
}));

vi.mock('@/server/routers/generation/_shared/helpers', async importOriginal => {
  const actual = await importOriginal<typeof import('@/server/routers/generation/_shared/helpers')>();
  return {
    ...actual,
    extractTierFromOrg: vi.fn((...args) => mockExtractTierFromOrg(...args)),
    checkConcurrencyLimits: vi.fn((...args) => mockCheckConcurrencyLimits(...args)),
    buildDocumentSummaries: vi.fn((...args) => mockBuildDocumentSummaries(...args)),
  };
});

vi.mock('@/server/helpers/course-authorization', () => ({
  assertCourseAccess: vi.fn((...args) => mockAssertCourseAccess(...args)),
  buildAuthContext: vi.fn(user => ({ user })),
}));

vi.mock('@/server/utils/supabase-query-guard', () => ({
  throwOnSupabaseError: vi.fn((...args) => mockThrowOnSupabaseError(...args)),
}));

describe('generateRouter.generate', () => {
  let caller: ReturnType<(typeof router)['createCaller']>;

  beforeAll(async () => {
    const { generateRouter } = await import('@/server/routers/generation/lifecycle/generate.router');
    const testRouter = router({
      generate: generateRouter.generate,
    });

    caller = testRouter.createCaller({
      user: {
        id: 'user-123',
        email: 'user@example.com',
        role: 'instructor',
        organizationId: 'org-123',
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractTierFromOrg.mockReturnValue('premium');
    mockCheckConcurrencyLimits.mockResolvedValue(undefined);
    mockAssertCourseAccess.mockReturnValue(undefined);
    mockThrowOnSupabaseError.mockReturnValue(undefined);
    mockAddJob.mockResolvedValue({ id: 'job-123' });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'course-123',
                organization_id: 'org-123',
                title: 'Course title',
                generation_status: 'failed',
                analysis_result: { summary: 'analysis' },
                course_description: 'desc',
                learning_outcomes: null,
                estimated_lessons: 5,
                estimated_sections: 2,
                settings: {},
                organization: { tier: 'premium' },
              },
              error: null,
            }),
          })),
        })),
      })),
    });
  });

  it('surfaces required-RAG unavailability as a PRECONDITION_FAILED TRPCError', async () => {
    mockBuildDocumentSummaries.mockRejectedValueOnce(
      new RequiredRagUnavailableError('course-123', 'qdrant_unavailable')
    );

    const request = caller.generate({ courseId: '550e8400-e29b-41d4-a716-446655440000' });

    await expect(request).rejects.toBeInstanceOf(TRPCError);
    await expect(request).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message:
        'This course has uploaded documents, but the vector database is temporarily unavailable. Please try again later.',
    });

    expect(mockAddJob).not.toHaveBeenCalled();
  });
});
