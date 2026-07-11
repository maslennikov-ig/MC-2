import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { JobType, type DocumentProcessingJobData } from '@megacampus/shared-types';
import type { EmbeddingResult } from '@/shared/embeddings/generate';

const { mockUploadChunksToQdrant, mockUpdateVectorStatus, mockGetSupabaseAdmin, mockLogger } =
  vi.hoisted(() => ({
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
  uploadChunksToQdrant: mockUploadChunksToQdrant,
  updateVectorStatus: mockUpdateVectorStatus,
}));

vi.mock('@/shared/supabase/admin.js', () => ({
  getSupabaseAdmin: vi.fn(() => mockGetSupabaseAdmin()),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

const BASE_JOB_DATA: DocumentProcessingJobData = {
  jobType: JobType.DOCUMENT_PROCESSING,
  organizationId: '10000000-0000-4000-8000-000000000001',
  courseId: '20000000-0000-4000-8000-000000000002',
  userId: '30000000-0000-4000-8000-000000000003',
  fileId: '40000000-0000-4000-8000-000000000004',
  filePath: '/tmp/source.pdf',
  mimeType: 'application/pdf',
  chunkSize: 512,
  chunkOverlap: 50,
  createdAt: '2026-07-10T12:00:00.000Z',
  locale: 'ru',
};

function createJob(data: Partial<DocumentProcessingJobData> = {}): {
  job: Job<DocumentProcessingJobData>;
  updateProgress: ReturnType<typeof vi.fn>;
} {
  const updateProgress = vi.fn().mockResolvedValue(undefined);
  return {
    job: {
      id: 'job-1',
      data: { ...BASE_JOB_DATA, ...data },
      updateProgress,
    } as unknown as Job<DocumentProcessingJobData>,
    updateProgress,
  };
}

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

    const { job, updateProgress } = createJob();

    await expect(executeQdrantUpload(embeddings, job)).rejects.toThrow(/Not Found/);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledTimes(1);
    expect(updateProgress).not.toHaveBeenCalledWith(95);
    expect(batchUpdate).toHaveBeenCalledWith('id', ['doc-1']);
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      expect.anything(),
      'Vectors uploaded to Qdrant'
    );
  });

  it('does not retry non-recoverable Qdrant Not Found upload errors', async () => {
    process.env.MAX_QDRANT_RETRIES = '3';

    const batchUpdate = vi.fn().mockResolvedValue({ error: null });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          in: batchUpdate,
        })),
      })),
    });

    mockUploadChunksToQdrant.mockRejectedValue(new Error('Not Found'));

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

    const { job } = createJob();

    await expect(executeQdrantUpload(embeddings, job)).rejects.toThrow(/Not Found/);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledWith('id', ['doc-1']);
  });

  it('retries recoverable Qdrant service errors before failing indexing', async () => {
    process.env.MAX_QDRANT_RETRIES = '3';

    const batchUpdate = vi.fn().mockResolvedValue({ error: null });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          in: batchUpdate,
        })),
      })),
    });

    mockUploadChunksToQdrant.mockRejectedValue(new Error('Service unavailable'));

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

    const { job } = createJob();

    await expect(executeQdrantUpload(embeddings, job)).rejects.toThrow(/Service unavailable/);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledTimes(3);
    expect(batchUpdate).toHaveBeenCalledWith('id', ['doc-1']);
  });

  it('forwards an explicit reindex physical target to the Qdrant upload', async () => {
    mockUploadChunksToQdrant.mockResolvedValue({
      points_uploaded: 1,
      batch_count: 1,
      duration_ms: 10,
      success: true,
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
    const { job } = createJob({ qdrantTargetCollection: 'course_embeddings_v2' });

    await executeQdrantUpload(embeddings, job);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledWith(embeddings, {
      batch_size: 100,
      collection_name: 'course_embeddings_v2',
      wait: true,
      enable_sparse: true,
    });
  });

  it('leaves collection selection to the stable alias default for normal jobs', async () => {
    mockUploadChunksToQdrant.mockResolvedValue({
      points_uploaded: 1,
      batch_count: 1,
      duration_ms: 10,
      success: true,
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
    const { job } = createJob();

    await executeQdrantUpload(embeddings, job);

    expect(mockUploadChunksToQdrant).toHaveBeenCalledWith(embeddings, {
      batch_size: 100,
      wait: true,
      enable_sparse: true,
    });
  });
});
