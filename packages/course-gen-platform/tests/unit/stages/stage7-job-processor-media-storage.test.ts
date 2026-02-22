import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Stage7JobInput, Stage7JobResult } from '../../../src/stages/stage7-enrichments/types';

const {
  mockGetEnrichment,
  mockUpdateEnrichmentStatus,
  mockSaveEnrichmentContent,
  mockSaveDraftContent,
  mockIncrementGenerationAttempt,
  mockUpsertAssetAndLinkEnrichment,
  mockSaveNotebookLMAsyncMetadataState,
  mockUploadEnrichmentAsset,
  mockRouteEnrichment,
  mockIsTwoStageEnrichment,
  mockQueueAdd,
  mockQueueGetJob,
} = vi.hoisted(() => ({
  mockGetEnrichment: vi.fn(),
  mockUpdateEnrichmentStatus: vi.fn(),
  mockSaveEnrichmentContent: vi.fn(),
  mockSaveDraftContent: vi.fn(),
  mockIncrementGenerationAttempt: vi.fn(),
  mockUpsertAssetAndLinkEnrichment: vi.fn(),
  mockSaveNotebookLMAsyncMetadataState: vi.fn(),
  mockUploadEnrichmentAsset: vi.fn(),
  mockRouteEnrichment: vi.fn(),
  mockIsTwoStageEnrichment: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockQueueGetJob: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Job: class {},
  Queue: class {
    add = mockQueueAdd;
    getJob = mockQueueGetJob;
  },
}));

vi.mock('@/shared/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return { logger: mockLogger, default: mockLogger };
});

vi.mock('../../../src/stages/stage7-enrichments/services/database-service', () => ({
  getEnrichment: mockGetEnrichment,
  updateEnrichmentStatus: mockUpdateEnrichmentStatus,
  saveEnrichmentContent: mockSaveEnrichmentContent,
  saveDraftContent: mockSaveDraftContent,
  incrementGenerationAttempt: mockIncrementGenerationAttempt,
  upsertAssetAndLinkEnrichment: mockUpsertAssetAndLinkEnrichment,
  saveNotebookLMAsyncMetadataState: mockSaveNotebookLMAsyncMetadataState,
}));

vi.mock('../../../src/stages/stage7-enrichments/services/unified-storage-service', () => ({
  uploadEnrichmentAsset: mockUploadEnrichmentAsset,
}));

vi.mock('../../../src/stages/stage7-enrichments/services/enrichment-router', () => ({
  routeEnrichment: mockRouteEnrichment,
  isTwoStageEnrichment: mockIsTwoStageEnrichment,
}));

vi.mock('../../../src/stages/stage7-enrichments/retry-strategy', () => ({
  shouldRetry: vi.fn(() => false),
  getRetryDelay: vi.fn(() => 0),
  getModelForAttempt: vi.fn(() => 'test-model'),
  formatErrorForLogging: vi.fn((error: Error) => ({ message: error.message })),
}));

describe('stage7 job processor media storage flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEnrichment.mockResolvedValue({
      enrichment: {
        id: '33333333-3333-4333-8333-333333333333',
        lesson_id: '22222222-2222-4222-8222-222222222222',
        course_id: '11111111-1111-4111-8111-111111111111',
        enrichment_type: 'audio',
        status: 'pending',
        order_index: 1,
        title: null,
        content: null,
        metadata: null,
        settings: null,
        generation_attempt: 0,
        error_message: null,
        error_details: null,
        created_at: '2026-02-20T00:00:00.000Z',
        updated_at: '2026-02-20T00:00:00.000Z',
      },
      lesson: {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Lesson',
        content: '# Lesson content',
        course_id: '11111111-1111-4111-8111-111111111111',
        objectives: null,
      },
      course: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Course',
        language: 'en',
      },
    });

    mockIncrementGenerationAttempt.mockResolvedValue(1);
    mockIsTwoStageEnrichment.mockReturnValue(false);
    mockUploadEnrichmentAsset.mockResolvedValue(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.mp3'
    );
    mockUpsertAssetAndLinkEnrichment.mockResolvedValue('44444444-4444-4444-8444-444444444444');
    mockQueueGetJob.mockResolvedValue(null);
    mockQueueAdd.mockResolvedValue({
      id: 'poll-job-1',
    });

    mockRouteEnrichment.mockReturnValue({
      generationFlow: 'single-stage',
      generate: vi.fn().mockResolvedValue({
        content: {
          type: 'audio',
          script: 'Narration',
          voice_id: 'alloy',
          duration_seconds: 20,
          format: 'mp3',
        },
        assetBuffer: Buffer.from('audio-bytes'),
        metadata: {
          generated_at: '2026-02-21T00:00:00.000Z',
          generation_duration_ms: 1200,
          total_tokens: 0,
          estimated_cost_usd: 0,
          model_used: 'test-model',
          quality_score: 1,
          retry_attempts: 0,
        },
      }),
    });
  });

  it('uploads media via unified storage and links enrichment through assets table UUID', async () => {
    const { processStage7Job } = await import(
      '../../../src/stages/stage7-enrichments/services/job-processor'
    );

    const job = {
      id: 'job-1',
      attemptsMade: 0,
      data: {
        enrichmentId: '33333333-3333-4333-8333-333333333333',
        enrichmentType: 'audio',
        lessonId: '22222222-2222-4222-8222-222222222222',
        courseId: '11111111-1111-4111-8111-111111111111',
        userId: '55555555-5555-4555-8555-555555555555',
        organizationId: '66666666-6666-4666-8666-666666666666',
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('active'),
    } as unknown as Job<Stage7JobInput, Stage7JobResult>;

    const result = await processStage7Job(job);

    expect(result.success).toBe(true);
    expect(mockUploadEnrichmentAsset).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.any(Buffer),
      'audio/mpeg',
      'mp3'
    );

    expect(mockUpsertAssetAndLinkEnrichment).toHaveBeenCalledWith({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
      courseId: '11111111-1111-4111-8111-111111111111',
      lessonId: '22222222-2222-4222-8222-222222222222',
      enrichmentType: 'audio',
      storagePath:
        '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.mp3',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      fileSizeBytes: Buffer.from('audio-bytes').length,
    });
  });

  it('schedules detached poll job for nlm audio when bridge task is pending', async () => {
    mockRouteEnrichment.mockReturnValue({
      generationFlow: 'single-stage',
      generateDraft: vi.fn().mockResolvedValue({
        draftContent: {
          type: 'nlm_audio_draft',
          script: 'draft script',
          voice_id: 'alloy',
          format: 'mp3',
          speed: 1,
          duration_seconds: 10,
        },
        metadata: {
          durationMs: 100,
          tokensUsed: 10,
          modelUsed: 'test-model',
        },
      }),
      generateFinal: vi.fn().mockResolvedValue({
        content: {
          type: 'audio',
          script: 'draft script',
          voice_id: 'alloy',
          duration_seconds: 10,
          format: 'mp3',
        },
        metadata: {
          generated_at: '2026-02-21T00:00:00.000Z',
          generation_duration_ms: 200,
          total_tokens: 10,
          estimated_cost_usd: 0,
          model_used: 'test-model',
          quality_score: 1,
          retry_attempts: 0,
        },
        deferredTask: {
          provider: 'notebooklm-bridge',
          mediaType: 'audio',
          taskId: 'bridge-task-1',
          status: 'in_progress',
          responseMetadata: { status: 'in_progress' },
        },
      }),
    });

    const { processStage7Job } = await import(
      '../../../src/stages/stage7-enrichments/services/job-processor'
    );

    const job = {
      id: 'job-nlm-start',
      attemptsMade: 0,
      data: {
        enrichmentId: '33333333-3333-4333-8333-333333333333',
        enrichmentType: 'nlm_audio',
        lessonId: '22222222-2222-4222-8222-222222222222',
        courseId: '11111111-1111-4111-8111-111111111111',
        userId: '55555555-5555-4555-8555-555555555555',
        organizationId: '66666666-6666-4666-8666-666666666666',
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('active'),
    } as unknown as Job<Stage7JobInput, Stage7JobResult>;

    const result = await processStage7Job(job);

    expect(result.success).toBe(true);
    expect(result.status).toBe('generating');
    expect(mockSaveNotebookLMAsyncMetadataState).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const queueAddOptions = mockQueueAdd.mock.calls[0]?.[2];
    expect(queueAddOptions?.jobId).toContain('bridge-task-1');
    expect(mockUploadEnrichmentAsset).not.toHaveBeenCalled();
    expect(mockSaveEnrichmentContent).not.toHaveBeenCalled();
  });

  it('finalizes nlm poll job when detached task completes', async () => {
    const deferredDraft = {
      draftContent: {
        type: 'nlm_audio_draft',
        script: 'draft script',
        voice_id: 'alloy',
        format: 'mp3',
        speed: 1,
        duration_seconds: 10,
      },
      metadata: {
        durationMs: 100,
        tokensUsed: 10,
        modelUsed: 'test-model',
      },
    };

    mockRouteEnrichment.mockReturnValue({
      generationFlow: 'single-stage',
      generateDraft: vi.fn(),
      generateFinal: vi.fn().mockResolvedValue({
        content: {
          type: 'audio',
          script: 'final script',
          voice_id: 'alloy',
          duration_seconds: 20,
          format: 'mp3',
        },
        assetBuffer: Buffer.from('final-audio-bytes'),
        assetMimeType: 'audio/mpeg',
        assetExtension: 'mp3',
        metadata: {
          generated_at: '2026-02-21T00:00:00.000Z',
          generation_duration_ms: 300,
          total_tokens: 30,
          estimated_cost_usd: 0,
          model_used: 'test-model',
          quality_score: 1,
          retry_attempts: 0,
        },
      }),
    });

    const { processStage7Job } = await import(
      '../../../src/stages/stage7-enrichments/services/job-processor'
    );

    const job = {
      id: 'job-nlm-poll',
      attemptsMade: 0,
      data: {
        enrichmentId: '33333333-3333-4333-8333-333333333333',
        enrichmentType: 'nlm_audio',
        lessonId: '22222222-2222-4222-8222-222222222222',
        courseId: '11111111-1111-4111-8111-111111111111',
        userId: '55555555-5555-4555-8555-555555555555',
        organizationId: '66666666-6666-4666-8666-666666666666',
        nlmAsyncState: {
          taskId: 'bridge-task-1',
          mediaType: 'audio',
          pollAttempt: 2,
          startedAt: '2026-02-21T00:00:00.000Z',
          draft: deferredDraft,
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('active'),
    } as unknown as Job<Stage7JobInput, Stage7JobResult>;

    const result = await processStage7Job(job);

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(mockUploadEnrichmentAsset).toHaveBeenCalledTimes(1);
    expect(mockSaveEnrichmentContent).toHaveBeenCalledTimes(1);
  });
});
