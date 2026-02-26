import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '../../../src/server/trpc';
import type { Context } from '../../../src/server/trpc';

const {
  mockVerifyEnrichmentAccess,
  mockSupabaseFrom,
  mockSupabaseSelect,
  mockSupabaseEq,
  mockSupabaseSingle,
  mockGetSignedUrl,
  mockUseLocalStorage,
  mockBuildPublicUrl,
} = vi.hoisted(() => ({
  mockVerifyEnrichmentAccess: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockSupabaseSelect: vi.fn(),
  mockSupabaseEq: vi.fn(),
  mockSupabaseSingle: vi.fn(),
  mockGetSignedUrl: vi.fn(),
  mockUseLocalStorage: vi.fn(),
  mockBuildPublicUrl: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-request-id'),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/server/routers/enrichment/helpers', () => ({
  verifyEnrichmentAccess: mockVerifyEnrichmentAccess,
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

vi.mock('@/stages/stage7-enrichments/services/storage-service', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock('@/stages/stage7-enrichments/services/unified-storage-service', () => ({
  useLocalStorage: mockUseLocalStorage,
  buildPublicUrl: mockBuildPublicUrl,
}));

import { getPlaybackUrl } from '../../../src/server/routers/enrichment/procedures/get-playback-url';

const testRouter = router({
  getPlaybackUrl,
});

function createAuthenticatedContext(): Context {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'test@example.com',
      role: 'instructor',
      organizationId: '22222222-2222-4222-8222-222222222222',
    },
  };
}

const baseEnrichment = {
  id: '33333333-3333-4333-8333-333333333333',
  lesson_id: '44444444-4444-4444-8444-444444444444',
  course_id: '55555555-5555-4555-8555-555555555555',
  enrichment_type: 'audio',
  status: 'completed' as const,
  order_index: 1,
  asset_id: '66666666-6666-4666-8666-666666666666',
  generation_attempt: 0,
  content: null,
  updated_at: '2026-02-20T00:00:00.000Z',
};

describe('getPlaybackUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifyEnrichmentAccess.mockResolvedValue(baseEnrichment);
    mockGetSignedUrl.mockResolvedValue('https://signed.example.com/audio.mp3');
    mockUseLocalStorage.mockReturnValue(false);
    mockBuildPublicUrl.mockReturnValue('https://local.example.com/storage/audio.mp3');

    mockSupabaseFrom.mockReturnValue({
      select: mockSupabaseSelect,
    });
    mockSupabaseSelect.mockReturnValue({
      eq: mockSupabaseEq,
    });
    mockSupabaseEq.mockReturnValue({
      single: mockSupabaseSingle,
    });
    mockSupabaseSingle.mockResolvedValue({
      data: { file_path: 'custom/course/path/file-with-real-extension.wav' },
      error: null,
    });
  });

  it('returns null URL when enrichment has no asset', async () => {
    mockVerifyEnrichmentAccess.mockResolvedValueOnce({
      ...baseEnrichment,
      asset_id: null,
    });

    const caller = testRouter.createCaller(createAuthenticatedContext());
    const result = await caller.getPlaybackUrl({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toEqual({
      url: null,
      expiresAt: null,
    });
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('returns null URL for non-playback enrichment types', async () => {
    mockVerifyEnrichmentAccess.mockResolvedValueOnce({
      ...baseEnrichment,
      enrichment_type: 'quiz',
    });

    const caller = testRouter.createCaller(createAuthenticatedContext());
    const result = await caller.getPlaybackUrl({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toEqual({
      url: null,
      expiresAt: null,
    });
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('resolves asset file_path from assets table and signs URL in supabase mode', async () => {
    const caller = testRouter.createCaller(createAuthenticatedContext());
    const result = await caller.getPlaybackUrl({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    });

    expect(mockSupabaseFrom).toHaveBeenCalledWith('assets');
    expect(mockSupabaseEq).toHaveBeenCalledWith('id', '66666666-6666-4666-8666-666666666666');
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      'custom/course/path/file-with-real-extension.wav',
      3600
    );

    expect(result.url).toBe('https://signed.example.com/audio.mp3');
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it('builds local playback URL in local storage mode', async () => {
    mockUseLocalStorage.mockReturnValueOnce(true);
    mockBuildPublicUrl.mockReturnValueOnce(
      'https://local.example.com/storage/custom/course/path/file-with-real-extension.wav'
    );

    const caller = testRouter.createCaller(createAuthenticatedContext());
    const result = await caller.getPlaybackUrl({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    });

    expect(mockBuildPublicUrl).toHaveBeenCalledWith(
      'custom/course/path/file-with-real-extension.wav'
    );
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(result.url).toBe(
      'https://local.example.com/storage/custom/course/path/file-with-real-extension.wav'
    );
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it('returns null URL when asset file_path is missing', async () => {
    mockSupabaseSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const caller = testRouter.createCaller(createAuthenticatedContext());
    const result = await caller.getPlaybackUrl({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toEqual({
      url: null,
      expiresAt: null,
    });
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(mockBuildPublicUrl).not.toHaveBeenCalled();
  });
});
