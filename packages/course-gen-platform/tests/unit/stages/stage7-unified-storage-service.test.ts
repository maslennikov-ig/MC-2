import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUploadLocal, mockUploadSupabase } = vi.hoisted(() => ({
  mockUploadLocal: vi.fn(),
  mockUploadSupabase: vi.fn(),
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

vi.mock('../../../src/stages/stage7-enrichments/services/local-storage-service', () => ({
  uploadEnrichmentAssetLocal: mockUploadLocal,
  uploadCourseCardLocal: vi.fn(),
  buildPublicUrl: vi.fn(),
  deleteEnrichmentAssetLocal: vi.fn(),
  assetExistsLocal: vi.fn(),
  getAssetMetadataLocal: vi.fn(),
  verifyStoragePermissions: vi.fn(),
}));

vi.mock('../../../src/stages/stage7-enrichments/services/storage-service', () => ({
  uploadEnrichmentAsset: mockUploadSupabase,
  deleteEnrichmentAsset: vi.fn(),
  assetExists: vi.fn(),
  getAssetMetadata: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/public' } })),
      })),
    },
  })),
}));

describe('stage7 unified storage service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('keeps image upload API compatible for local storage backend', async () => {
    process.env.USE_LOCAL_STORAGE = 'true';
    mockUploadLocal.mockResolvedValue('local/image.webp');

    const { uploadEnrichmentAsset } = await import(
      '../../../src/stages/stage7-enrichments/services/unified-storage-service'
    );

    await uploadEnrichmentAsset(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      Buffer.from('image'),
      'webp'
    );

    expect(mockUploadLocal).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.any(Buffer),
      'webp'
    );
    expect(mockUploadSupabase).not.toHaveBeenCalled();
  });

  it('supports media-aware upload signature with mime + extension for supabase backend', async () => {
    process.env.USE_LOCAL_STORAGE = 'false';
    mockUploadSupabase.mockResolvedValue('supabase/audio.mp3');

    const { uploadEnrichmentAsset } = await import(
      '../../../src/stages/stage7-enrichments/services/unified-storage-service'
    );

    await uploadEnrichmentAsset(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      Buffer.from('audio'),
      'audio/mpeg',
      'mp3'
    );

    expect(mockUploadSupabase).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.any(Buffer),
      'audio/mpeg',
      'mp3'
    );
  });

  it('supports media-aware upload signature for local backend', async () => {
    process.env.USE_LOCAL_STORAGE = 'true';
    mockUploadLocal.mockResolvedValue('local/video.mp4');

    const { uploadEnrichmentAsset } = await import(
      '../../../src/stages/stage7-enrichments/services/unified-storage-service'
    );

    await uploadEnrichmentAsset(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      Buffer.from('video'),
      'video/mp4',
      'mp4'
    );

    expect(mockUploadLocal).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.any(Buffer),
      'mp4'
    );
    expect(mockUploadSupabase).not.toHaveBeenCalled();
  });
});
