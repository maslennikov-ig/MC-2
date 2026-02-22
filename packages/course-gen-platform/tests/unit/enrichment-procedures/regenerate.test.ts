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

vi.mock('@/stages/stage7-enrichments/services/storage-service', () => ({
  deleteEnrichmentAsset: vi.fn(),
}));

vi.mock('@/server/routers/enrichment/helpers', () => ({
  verifyEnrichmentAccess: mockVerifyEnrichmentAccess,
  isTwoStageType: (type: string) => type === 'video' || type === 'presentation',
  buildAssetPath: vi.fn(() => 'path/to/asset'),
  shouldReuseLegacyNlmDraft: (type: string, status: string | undefined) =>
    (type === 'nlm_audio' || type === 'nlm_video') &&
    (status === 'draft_ready' || status === 'draft_generating'),
}));

vi.mock('@/stages/stage7-enrichments/factory', () => ({
  createStage7Queue: mockCreateStage7Queue,
  addEnrichmentJob: mockAddEnrichmentJob,
}));

import { regenerate } from '../../../src/server/routers/enrichment/procedures/regenerate';

const testRouter = router({
  regenerate,
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

describe('regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyEnrichmentAccess.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440099',
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      course_id: '550e8400-e29b-41d4-a716-446655440001',
      enrichment_type: 'nlm_video',
      status: 'draft_ready',
      order_index: 1,
      asset_id: null,
      generation_attempt: 2,
      content: { script: 'legacy draft' },
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
    mockAddEnrichmentJob.mockResolvedValue({ id: 'regen-job-123' });
  });

  it('allows legacy NLM draft statuses and enqueues as single-stage', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());

    const result = await caller.regenerate({
      enrichmentId: '550e8400-e29b-41d4-a716-446655440099',
    });

    expect(result.success).toBe(true);

    expect(mockSupabaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        content: null,
      })
    );

    expect(mockAddEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichmentType: 'nlm_video',
        isDraftPhase: false,
      }),
      expect.objectContaining({
        jobId: 'enrich-550e8400-e29b-41d4-a716-446655440099-3',
      })
    );
  });
});
