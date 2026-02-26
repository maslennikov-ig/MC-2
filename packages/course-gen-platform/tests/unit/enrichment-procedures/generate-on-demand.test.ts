import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '../../../src/server/trpc';
import type { Context } from '../../../src/server/trpc';

const {
  mockVerifyLessonAccess,
  mockGetNextOrderIndex,
  mockCheckExistingEnrichment,
  mockFindReusableEnrichment,
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
  mockFindReusableEnrichment: vi.fn(),
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
  findReusableEnrichment: mockFindReusableEnrichment,
  isTwoStageType: (type: string) => type === 'video' || type === 'presentation',
  shouldReuseLegacyNlmDraft: (type: string, status: string | undefined) =>
    (type === 'nlm_audio' || type === 'nlm_video') &&
    (status === 'draft_ready' || status === 'draft_generating'),
}));

vi.mock('@/stages/stage7-enrichments/factory', () => ({
  createStage7Queue: mockCreateStage7Queue,
  addEnrichmentJob: mockAddEnrichmentJob,
}));

import { generateOnDemand } from '../../../src/server/routers/enrichment/procedures/generate-on-demand';

const testRouter = router({
  generateOnDemand,
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

describe('generateOnDemand', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyLessonAccess.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      course_id: 'course-123',
      title: 'Test Lesson',
    });

    mockGetNextOrderIndex.mockResolvedValue(1);
    mockCheckExistingEnrichment.mockResolvedValue({ exists: false });
    mockFindReusableEnrichment.mockResolvedValue(null);

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

  it('enqueues nlm_audio as single-stage (isDraftPhase=false)', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());

    await caller.generateOnDemand({
      lessonId: '550e8400-e29b-41d4-a716-446655440000',
      enrichmentType: 'nlm_audio',
      settings: { nlm_audio_format: 'brief' },
    });

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentType: 'nlm_audio',
        isDraftPhase: false,
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^enrich-ondemand-/),
      })
    );
  });

  it('keeps presentation as two-stage enqueue (isDraftPhase=true)', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());

    await caller.generateOnDemand({
      lessonId: '550e8400-e29b-41d4-a716-446655440000',
      enrichmentType: 'presentation',
      settings: { slideCount: 8 },
    });

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentType: 'presentation',
        isDraftPhase: true,
      }),
      expect.anything()
    );
  });

  it('reuses legacy NLM draft enrichment instead of throwing CONFLICT', async () => {
    mockCheckExistingEnrichment.mockResolvedValueOnce({
      exists: true,
      enrichmentId: 'legacy-nlm-enrichment',
      status: 'draft_ready',
    });

    const caller = testRouter.createCaller(createAuthenticatedContext());

    const result = await caller.generateOnDemand({
      lessonId: '550e8400-e29b-41d4-a716-446655440000',
      enrichmentType: 'nlm_video',
      settings: { nlm_video_format: 'brief' },
    });

    expect(result.enrichmentId).toBe('legacy-nlm-enrichment');

    expect(mockSupabaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        content: null,
        asset_id: null,
      })
    );

    expect(mockSupabaseUpdateEq).toHaveBeenCalledWith('id', 'legacy-nlm-enrichment');

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentId: 'legacy-nlm-enrichment',
        enrichmentType: 'nlm_video',
        isDraftPhase: false,
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^enrich-ondemand-legacy-nlm-enrichment-/),
      })
    );
  });
});
