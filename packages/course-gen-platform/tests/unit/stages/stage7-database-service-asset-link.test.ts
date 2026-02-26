import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSupabaseAdmin } = vi.hoisted(() => ({
  mockGetSupabaseAdmin: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  };
  return { logger: mockLogger, default: mockLogger };
});

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

function createSupabaseClient(existingAssetId: string | null = null) {
  const single = vi.fn().mockResolvedValue({
    data: { asset_id: existingAssetId },
    error: null,
  });
  const selectEq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: selectEq });

  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const assetsUpsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'lesson_enrichments') {
      return {
        select,
        update,
      };
    }
    if (table === 'assets') {
      return {
        upsert: assetsUpsert,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    calls: {
      assetsUpsert,
      update,
      updateEq,
    },
  };
}

describe('stage7 database service asset upsert/link helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts asset row and links lesson enrichment to assets.id UUID', async () => {
    const { client, calls } = createSupabaseClient();
    mockGetSupabaseAdmin.mockReturnValue(client);

    const { upsertAssetAndLinkEnrichment } = await import(
      '../../../src/stages/stage7-enrichments/services/database-service'
    );

    const assetId = await upsertAssetAndLinkEnrichment({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
      courseId: '11111111-1111-4111-8111-111111111111',
      lessonId: '22222222-2222-4222-8222-222222222222',
      enrichmentType: 'audio',
      storagePath:
        '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.mp3',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      fileSizeBytes: 11,
    });

    expect(assetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    expect(calls.assetsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: assetId,
        course_id: '11111111-1111-4111-8111-111111111111',
        lesson_id: '22222222-2222-4222-8222-222222222222',
        asset_type: 'audio',
        file_path:
          '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.mp3',
        mime_type: 'audio/mpeg',
        filename: '33333333-3333-4333-8333-333333333333.mp3',
        size_bytes: 11,
        file_size_bytes: 11,
      }),
      { onConflict: 'id' }
    );

    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_id: assetId,
      })
    );
    expect(calls.updateEq).toHaveBeenCalledWith('id', '33333333-3333-4333-8333-333333333333');
  });

  it('reuses existing linked asset UUID when present', async () => {
    const existingAssetId = '77777777-7777-4777-8777-777777777777';
    const { client, calls } = createSupabaseClient(existingAssetId);
    mockGetSupabaseAdmin.mockReturnValue(client);

    const { upsertAssetAndLinkEnrichment } = await import(
      '../../../src/stages/stage7-enrichments/services/database-service'
    );

    const assetId = await upsertAssetAndLinkEnrichment({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
      courseId: '11111111-1111-4111-8111-111111111111',
      lessonId: '22222222-2222-4222-8222-222222222222',
      enrichmentType: 'nlm_video',
      storagePath:
        '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.mp4',
      mimeType: 'video/mp4',
      extension: 'mp4',
      fileSizeBytes: 21,
    });

    expect(assetId).toBe(existingAssetId);
    expect(calls.assetsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: existingAssetId }),
      { onConflict: 'id' }
    );
  });
});
