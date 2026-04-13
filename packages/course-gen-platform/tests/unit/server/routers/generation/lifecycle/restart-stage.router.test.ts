import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/server/trpc';

const {
  mockAddJob,
  mockDeleteVectorsForDocument,
  mockGetSupabaseAdmin,
  mockLogger,
  mockRemoveJobsByCourseId,
  mockValidateLocale,
} = vi.hoisted(() => ({
  mockAddJob: vi.fn(),
  mockDeleteVectorsForDocument: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockRemoveJobsByCourseId: vi.fn(),
  mockValidateLocale: vi.fn((locale: string | null | undefined) => locale ?? 'en'),
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
  removeJobsByCourseId: vi.fn((...args) => mockRemoveJobsByCourseId(...args)),
}));

vi.mock('@/shared/qdrant/lifecycle', () => ({
  deleteVectorsForDocument: vi.fn((...args) => mockDeleteVectorsForDocument(...args)),
}));

vi.mock('@/shared/validation', () => ({
  validateLocale: vi.fn((...args) => mockValidateLocale(...args)),
}));

vi.mock('@/server/middleware/rate-limit.js', () => ({
  createRateLimiter: () => vi.fn(({ next }) => next()),
}));

describe('restartStageRouter.restartStage', () => {
  let caller: ReturnType<(typeof router)['createCaller']>;

  beforeAll(async () => {
    const { restartStageRouter } = await import(
      '@/server/routers/generation/lifecycle/restart-stage.router'
    );
    const testRouter = router({
      restartStage: restartStageRouter.restartStage,
    });

    caller = testRouter.createCaller({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com',
        role: 'instructor',
        organizationId: '22222222-2222-4222-8222-222222222222',
      },
      req: new Request('http://localhost'),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockRemoveJobsByCourseId.mockResolvedValue({ removed: 0, errors: [] });
    mockAddJob.mockResolvedValue({ id: 'job-123' });

    mockGetSupabaseAdmin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          previousStatus: 'failed',
          newStatus: 'stage_4_init',
          organizationId: '22222222-2222-4222-8222-222222222222',
        },
        error: null,
      }),
      from: vi.fn((table: string) => {
        if (table === 'courses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    title: 'Restart test course',
                    settings: { clarifying_questions_enabled: true },
                    language: 'en',
                    course_size: 'medium',
                  },
                  error: null,
                }),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  it('calls restart_from_stage RPC with the canonical parameter names and order', async () => {
    const supabase = mockGetSupabaseAdmin();

    await caller.restartStage({
      courseId: '33333333-3333-4333-8333-333333333333',
      stageNumber: 4,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('restart_from_stage', {
      p_course_id: '33333333-3333-4333-8333-333333333333',
      p_stage_number: 4,
      p_user_id: '11111111-1111-4111-8111-111111111111',
    });
  });
});
