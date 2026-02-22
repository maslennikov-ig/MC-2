import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '../../../src/server/trpc';
import type { Context } from '../../../src/server/trpc';

const {
  mockVerifyEnrichmentAccess,
  mockSupabaseFrom,
  mockSupabaseUpdate,
  mockSupabaseUpdateEq,
  mockCreateStage7Queue,
  mockAddEnrichmentJob,
} = vi.hoisted(() => ({
  mockVerifyEnrichmentAccess: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockSupabaseUpdate: vi.fn(),
  mockSupabaseUpdateEq: vi.fn(),
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
  verifyEnrichmentAccess: mockVerifyEnrichmentAccess,
  isTwoStageType: (type: string) => type === 'video' || type === 'presentation',
}));

vi.mock('@/stages/stage7-enrichments/factory', () => ({
  createStage7Queue: mockCreateStage7Queue,
  addEnrichmentJob: mockAddEnrichmentJob,
}));

import { approveDraft } from '../../../src/server/routers/enrichment/procedures/approve-draft';

const testRouter = router({
  approveDraft,
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

describe('approveDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyEnrichmentAccess.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      lesson_id: '22222222-2222-4222-8222-222222222222',
      course_id: '33333333-3333-4333-8333-333333333333',
      enrichment_type: 'video',
      status: 'draft_ready',
      order_index: 1,
      asset_id: null,
      generation_attempt: 0,
      // Legacy/current storage format: draft is stored directly in content
      content: {
        script: 'Draft script content',
      },
      updated_at: '2026-02-20T00:00:00.000Z',
    });

    mockSupabaseFrom.mockReturnValue({
      update: mockSupabaseUpdate,
    });

    mockSupabaseUpdate.mockReturnValue({
      eq: mockSupabaseUpdateEq,
    });

    mockSupabaseUpdateEq.mockResolvedValue({ error: null });

    mockCreateStage7Queue.mockReturnValue({ add: vi.fn() });
    mockAddEnrichmentJob.mockResolvedValue({ id: 'final-job-123' });
  });

  it('accepts draft content stored directly in enrichment.content', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());

    const result = await caller.approveDraft({
      enrichmentId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.success).toBe(true);

    expect(mockSupabaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
      })
    );

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentId: '11111111-1111-4111-8111-111111111111',
        enrichmentType: 'video',
        isDraftPhase: false,
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^enrich-final-11111111-1111-4111-8111-111111111111-/),
      })
    );
  });
});
