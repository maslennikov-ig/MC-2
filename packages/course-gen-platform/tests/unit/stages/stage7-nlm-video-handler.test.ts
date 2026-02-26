import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DraftResult,
  EnrichmentHandlerInput,
} from '../../../src/stages/stage7-enrichments/types';

const {
  mockStartVideo,
  mockGetTaskStatus,
  mockGetTaskMedia,
  mockGetLessonContent,
  mockVideoGenerateDraft,
} = vi.hoisted(() => ({
  mockStartVideo: vi.fn(),
  mockGetTaskStatus: vi.fn(),
  mockGetTaskMedia: vi.fn(),
  mockGetLessonContent: vi.fn(),
  mockVideoGenerateDraft: vi.fn(),
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

vi.mock('../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client', () => ({
  isNotebookLMTaskFailedStatus: (status: string) => ['failed', 'error', 'timeout'].includes(status),
  isNotebookLMTaskSuccessfulStatus: (status: string) => ['completed', 'success'].includes(status),
  notebookLmBridgeClient: {
    startVideo: mockStartVideo,
    getTaskStatus: mockGetTaskStatus,
    getTaskMedia: mockGetTaskMedia,
  },
}));

vi.mock('../../../src/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: mockGetLessonContent,
}));

vi.mock('../../../src/stages/stage7-enrichments/handlers/video-handler', () => ({
  videoHandler: {
    generationFlow: 'two-stage',
    generate: vi.fn(),
    generateDraft: mockVideoGenerateDraft,
  },
}));

import { nlmVideoHandler } from '../../../src/stages/stage7-enrichments/handlers/nlm-video-handler';

function createInput(
  settings: Record<string, unknown> = {},
  lessonDurationMinutes?: number | null
): EnrichmentHandlerInput {
  return {
    enrichmentContext: {
      enrichment: {
        id: 'enrichment-video-1',
        lesson_id: 'lesson-1',
        course_id: 'course-1',
        enrichment_type: 'nlm_video',
        status: 'approved',
        order_index: 1,
        title: null,
        content: null,
        metadata: null,
        settings: null,
        generation_attempt: 1,
        error_message: null,
        error_details: null,
        created_at: '2026-02-20T00:00:00.000Z',
        updated_at: '2026-02-20T00:00:00.000Z',
      },
      lesson: {
        id: 'lesson-1',
        title: 'Lesson Title',
        content: null,
        course_id: 'course-1',
        duration_minutes: lessonDurationMinutes ?? null,
        objectives: ['Explain concept A', 'Describe concept B'],
      },
      course: {
        id: 'course-1',
        title: 'Course Title',
        language: 'en',
      },
    },
    settings,
  } as EnrichmentHandlerInput;
}

function createDraft(): DraftResult {
  return {
    draftContent: {
      script: 'Final video script',
      estimated_duration_seconds: 81,
      section_count: 4,
      tone: 'friendly',
      pacing: 'steady',
    },
    metadata: {
      durationMs: 220,
      tokensUsed: 57,
      modelUsed: 'draft-model',
    },
  };
}

describe('stage7 nlm video handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLessonContent.mockResolvedValue('# Raw Lesson\n\nLong-form markdown');
    mockVideoGenerateDraft.mockResolvedValue(createDraft());
    mockStartVideo.mockResolvedValue({
      taskId: 'task-video-1',
      status: 'queued',
      responseMetadata: { provider: 'mock-bridge' },
    });
    mockGetTaskMedia.mockResolvedValue({
      buffer: Buffer.from('video-bytes'),
      mimeType: 'video/mp4',
      extension: 'mp4',
      durationSeconds: 95,
      responseMetadata: { provider: 'mock-bridge' },
    });
  });

  it('builds hybrid source bundle with default video presets and returns detached task', async () => {
    const result = await nlmVideoHandler.generateFinal!(createInput(), createDraft());

    expect(mockStartVideo).toHaveBeenCalledTimes(1);
    expect(mockGetTaskStatus).not.toHaveBeenCalled();
    expect(mockGetTaskMedia).not.toHaveBeenCalled();

    const request = mockStartVideo.mock.calls[0][0];
    expect(request.courseId).toBe('course-1');
    expect(request.videoFormat).toBe('explainer');
    expect(request.videoStyle).toBe('auto_select');
    expect(request.targetDurationMinutes).toBe(5);
    expect(request.durationRangeMinMinutes).toBe(4);
    expect(request.durationRangeMaxMinutes).toBe(7);
    expect(request.sources).toHaveLength(3);
    expect(request.sources[0].content).toContain('Final video script');
    expect(request.sources[1].content).toContain('Raw Lesson');
    expect(request.sources[2].content).toContain('Explain concept A');

    expect(result.deferredTask).toBeDefined();
    expect(result.deferredTask?.taskId).toBe('task-video-1');
    expect(result.deferredTask?.mediaType).toBe('video');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('hybrid');
    expect(additionalInfo.source_count).toBe(3);
    expect(additionalInfo.video_format_preset).toBe('explainer');
    expect(additionalInfo.video_style_preset).toBe('auto_select');
    expect(additionalInfo.duration_target_minutes).toBe(5);
    expect(additionalInfo.duration_range_min_minutes).toBe(4);
    expect(additionalInfo.duration_range_max_minutes).toBe(7);
  });

  it('injects NLM duration guidance into draft settings', async () => {
    await nlmVideoHandler.generateDraft!(createInput({}, 6));

    expect(mockVideoGenerateDraft).toHaveBeenCalledTimes(1);
    const forwardedInput = mockVideoGenerateDraft.mock.calls[0][0] as EnrichmentHandlerInput;

    expect(forwardedInput.settings.target_duration_minutes).toBe(6);
    expect(forwardedInput.settings.duration_range_min_minutes).toBe(4);
    expect(forwardedInput.settings.duration_range_max_minutes).toBe(7);
  });

  it('respects raw-only source strategy and explicit video presets', async () => {
    const input = createInput({
      nlm_source_strategy: 'raw_only',
      nlm_video_style: 'classic',
      nlm_video_format: 'brief',
    });

    const result = await nlmVideoHandler.generateFinal!(input, createDraft());

    const request = mockStartVideo.mock.calls[0][0];
    expect(request.videoFormat).toBe('brief');
    expect(request.videoStyle).toBe('classic');
    expect(request.sources).toHaveLength(2);
    expect(request.sources[0].content).toContain('Raw Lesson');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('raw_only');
    expect(additionalInfo.source_count).toBe(2);
    expect(additionalInfo.video_format_preset).toBe('brief');
    expect(additionalInfo.video_style_preset).toBe('classic');
  });

  it('infers brief video format for short lessons when preset is not explicitly set', async () => {
    await nlmVideoHandler.generateFinal!(createInput({}, 4), createDraft());

    const request = mockStartVideo.mock.calls[0][0];
    expect(request.videoFormat).toBe('brief');
    expect(request.targetDurationMinutes).toBe(4);
    expect(request.durationRangeMinMinutes).toBe(4);
    expect(request.durationRangeMaxMinutes).toBe(7);
  });

  it('returns deferred task in poll mode when video task is not ready', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-video-1',
      status: 'pending',
      responseMetadata: { progress: 40 },
    });

    const result = await nlmVideoHandler.generateFinal!(
      createInput({
        __nlm_async_mode: 'poll',
        __nlm_bridge_task_id: 'task-video-1',
        __nlm_poll_attempt: 3,
      }),
      createDraft()
    );

    expect(mockGetTaskStatus).toHaveBeenCalledWith('task-video-1', 'video');
    expect(result.deferredTask?.taskId).toBe('task-video-1');
    expect(result.deferredTask?.status).toBe('pending');
    expect(mockGetTaskMedia).not.toHaveBeenCalled();
    expect(mockStartVideo).not.toHaveBeenCalled();
  });

  it('fetches final media in poll mode when video task is completed', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-video-1',
      status: 'completed',
      responseMetadata: { progress: 100 },
    });

    const result = await nlmVideoHandler.generateFinal!(
      createInput({
        __nlm_async_mode: 'poll',
        __nlm_bridge_task_id: 'task-video-1',
      }),
      createDraft()
    );

    expect(mockGetTaskStatus).toHaveBeenCalledWith('task-video-1', 'video');
    expect(mockGetTaskMedia).toHaveBeenCalledWith('task-video-1', 'video');
    expect(result.deferredTask).toBeUndefined();
    expect(result.assetBuffer?.equals(Buffer.from('video-bytes'))).toBe(true);
  });

  it('surfaces bridge failed status in poll mode for stage7 retry strategy', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-video-1',
      status: 'failed',
      responseMetadata: { detail: 'failed' },
    });

    await expect(
      nlmVideoHandler.generateFinal!(
        createInput({
          __nlm_async_mode: 'poll',
          __nlm_bridge_task_id: 'task-video-1',
        }),
        createDraft()
      )
    ).rejects.toThrow(/task failed/i);
  });
});
