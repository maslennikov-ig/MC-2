import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '../../../src/server/trpc';
import type { Context } from '../../../src/server/trpc';

const {
  mockVerifyLessonAccess,
  mockGetNextOrderIndex,
  mockCheckExistingEnrichment,
  mockSupabaseFrom,
  mockSupabaseUpdate,
  mockSupabaseUpdateEq,
  mockSupabaseInsert,
  mockCreateStage7Queue,
  mockAddEnrichmentJob,
} = vi.hoisted(() => ({
  mockVerifyLessonAccess: vi.fn(),
  mockGetNextOrderIndex: vi.fn(),
  mockCheckExistingEnrichment: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockSupabaseUpdate: vi.fn(),
  mockSupabaseUpdateEq: vi.fn(),
  mockSupabaseInsert: vi.fn(),
  mockCreateStage7Queue: vi.fn(),
  mockAddEnrichmentJob: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-request-id'),
}));

vi.mock('@/shared/logger/index.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { default: mockLogger, logger: mockLogger };
});

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

vi.mock('@/server/routers/enrichment/helpers', () => ({
  verifyLessonAccess: mockVerifyLessonAccess,
  getNextOrderIndex: mockGetNextOrderIndex,
  checkExistingEnrichment: mockCheckExistingEnrichment,
  isTwoStageType: (type: string) => type === 'video' || type === 'presentation',
  shouldReuseLegacyNlmDraft: (type: string, status: string | undefined) =>
    (type === 'nlm_audio' || type === 'nlm_video') &&
    (status === 'draft_ready' || status === 'draft_generating'),
}));

vi.mock('@/stages/stage7-enrichments/factory', () => ({
  createStage7Queue: mockCreateStage7Queue,
  addEnrichmentJob: mockAddEnrichmentJob,
}));

import { create } from '../../../src/server/routers/enrichment/procedures/create';

const testRouter = router({
  create,
});

function createAuthenticatedContext(): Context {
  return {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'instructor',
      organizationId: 'org-123',
    },
  };
}

describe('create', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyLessonAccess.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      course_id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Test Lesson',
    });

    mockGetNextOrderIndex.mockResolvedValue(3);
    mockCheckExistingEnrichment.mockResolvedValue({
      exists: true,
      enrichmentId: '550e8400-e29b-41d4-a716-446655440099',
      status: 'draft_generating',
    });

    mockSupabaseFrom.mockReturnValue({
      update: mockSupabaseUpdate,
      insert: mockSupabaseInsert,
    });

    mockSupabaseUpdate.mockReturnValue({
      eq: mockSupabaseUpdateEq,
    });

    mockSupabaseUpdateEq.mockResolvedValue({ error: null });
    mockSupabaseInsert.mockResolvedValue({ error: null });

    mockCreateStage7Queue.mockReturnValue({ add: vi.fn() });
    mockAddEnrichmentJob.mockResolvedValue({ id: 'job-123' });
  });

  it('resets and reuses legacy NLM draft enrichment instead of creating a new row', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());

    const result = await caller.create({
      lessonId: '550e8400-e29b-41d4-a716-446655440000',
      enrichmentType: 'nlm_audio',
      settings: { nlm_audio_format: 'brief' },
    });

    expect(result.enrichmentId).toBe('550e8400-e29b-41d4-a716-446655440099');

    expect(mockSupabaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        content: null,
        asset_id: null,
      })
    );
    expect(mockSupabaseUpdateEq).toHaveBeenCalledWith('id', '550e8400-e29b-41d4-a716-446655440099');

    expect(mockSupabaseInsert).not.toHaveBeenCalled();

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440099',
        enrichmentType: 'nlm_audio',
        isDraftPhase: false,
      }),
      expect.objectContaining({
        jobId: 'enrich-550e8400-e29b-41d4-a716-446655440099',
      })
    );
  });
});
