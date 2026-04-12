import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhaseContext } from '@/stages/stage2-document-processing/orchestrator-phase-helpers';

const {
  mockGetSupabaseAdmin,
  mockUpdateCourseProgressInDB,
  mockUpdateDocumentProcessingProgress,
  mockLogger,
  mockLogTrace,
} = vi.hoisted(() => ({
  mockGetSupabaseAdmin: vi.fn(),
  mockUpdateCourseProgressInDB: vi.fn(),
  mockUpdateDocumentProcessingProgress: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockLogTrace: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockGetSupabaseAdmin()),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn((...args) => mockLogTrace(...args)),
}));

vi.mock('@/shared/i18n', () => ({
  getTranslator: vi.fn(() => (key: string) => key),
}));

vi.mock('@/stages/stage2-document-processing/orchestrator-progress-helpers', () => ({
  updateCourseProgressInDB: vi.fn((...args) => mockUpdateCourseProgressInDB(...args)),
  updateDocumentProcessingProgress: vi.fn((...args) => mockUpdateDocumentProcessingProgress(...args)),
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-1-docling-conversion', () => ({
  executeDoclingConversion: vi.fn(),
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-4-chunking', () => ({
  executeChunking: vi.fn(),
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-5-embedding', () => ({
  executeEmbeddingGeneration: vi.fn(),
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-6-qdrant-upload', () => ({
  executeQdrantUpload: vi.fn(),
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-6-summarization', () => ({
  executePhase6Summarization: vi.fn(),
}));

vi.mock('@/stages/stage2-document-processing/orchestrator-fallback-helpers', () => ({
  attemptFallbackExtraction: vi.fn(),
  storeFallbackProcessedContent: vi.fn(),
}));

describe('orchestrator-phase-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(): PhaseContext {
    return {
      fileId: 'file-1',
      filePath: '/tmp/file.pdf',
      courseId: 'course-1',
      organizationId: 'org-1',
      locale: 'ru',
      tier: 'premium',
      mimeType: 'application/pdf',
      priority: 'core',
      priorityWeight: 1,
      job: {
        id: 'job-1',
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as any,
      startTime: Date.now() - 500,
    };
  }

  it('does not finalize as indexed when file vector_status is failed', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { vector_status: 'failed', error_message: 'Not Found' },
              error: null,
            }),
          })),
        })),
      })),
    });

    const { finalizeProcessing } = await import(
      '@/stages/stage2-document-processing/orchestrator-phase-helpers'
    );

    const context = createContext();

    await expect(finalizeProcessing(context)).rejects.toThrow(/vector_status/i);

    expect(context.job.updateProgress).toHaveBeenCalledWith(95);
    expect(context.job.updateProgress).not.toHaveBeenCalledWith(100);
    expect(mockUpdateDocumentProcessingProgress).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      'Document processing pipeline complete'
    );
  });

  it('finalizes successfully when file vector_status is indexed', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { vector_status: 'indexed', error_message: null },
              error: null,
            }),
          })),
        })),
      })),
    });

    const { finalizeProcessing } = await import(
      '@/stages/stage2-document-processing/orchestrator-phase-helpers'
    );

    const context = createContext();

    await expect(finalizeProcessing(context)).resolves.toBeUndefined();

    expect(mockUpdateDocumentProcessingProgress).toHaveBeenCalled();
    expect(context.job.updateProgress).toHaveBeenCalledWith(100);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file-1', status: 'indexed' }),
      'Document processing pipeline complete'
    );
  });
});
