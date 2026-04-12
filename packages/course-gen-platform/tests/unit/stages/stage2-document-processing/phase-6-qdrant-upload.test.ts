import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddingResult } from '@/shared/embeddings/generate';

const {
  mockUploadChunksToQdrant,
  mockUpdateVectorStatus,
  mockGetSupabaseAdmin,
  mockLogger,
} = vi.hoisted(() => ({
  mockUploadChunksToQdrant: vi.fn(),
  mockUpdateVectorStatus: vi.fn(),
  mockGetSupabaseAdmin: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/shared/qdrant/upload.js', () => ({
  uploadChunksToQdrant: vi.fn((...args) => mockUploadChunksToQdrant(...args)),
  updateVectorStatus: vi.fn((...args) => mockUpdateVectorStatus(...args)),
}));

vi.mock('@/shared/supabase/admin.js', () => ({
  getSupabaseAdmin: vi.fn(() => mockGetSupabaseAdmin()),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

describe('phase-6-qdrant-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.MAX_QDRANT_RETRIES = '1';
    process.env.QDRANT_UPLOAD_TIMEOUT_MS = '1000';
    process.env.QDRANT_BASE_RETRY_DELAY_MS = '1';
  });

  it('treats soft upload failures as failed indexing and never logs success', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ error: null });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          in: batchUpdate,
        })),
      })),
    });

    mockUploadChunksToQdrant.mockResolvedValue({
      points_uploaded: 0,
      batch_count: 0,
      duration_ms: 17,
      success: false,
      error: 'Not Found',
    });

    const { executeQdrantUpload } = await import(
      '@/stages/stage2-document-processing/phases/phase-6-qdrant-upload'
    );

    const embeddings = [
      {
        chunk: {
          document_id: 'doc-1',
        },
      },
    ] as EmbeddingResult[];

    const job = {
      id: 'job-1',
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as any;

    await expect(executeQdrantUpload(embeddings, job)).rejects.toThrow(/Not Found/);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledTimes(1);
    expect(job.updateProgress).not.toHaveBeenCalledWith(95);
    expect(batchUpdate).toHaveBeenCalledWith('id', ['doc-1']);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      'Vectors uploaded to Qdrant'
    );
  });
});
