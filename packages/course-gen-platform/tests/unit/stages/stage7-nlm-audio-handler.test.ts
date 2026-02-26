import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DraftResult,
  EnrichmentHandlerInput,
} from '../../../src/stages/stage7-enrichments/types';

const { mockStartAudio, mockGetTaskStatus, mockGetTaskMedia, mockGetLessonContent } = vi.hoisted(
  () => ({
    mockStartAudio: vi.fn(),
    mockGetTaskStatus: vi.fn(),
    mockGetTaskMedia: vi.fn(),
    mockGetLessonContent: vi.fn(),
  })
);

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
    startAudio: mockStartAudio,
    getTaskStatus: mockGetTaskStatus,
    getTaskMedia: mockGetTaskMedia,
  },
}));

vi.mock('../../../src/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: mockGetLessonContent,
}));

import { nlmAudioHandler } from '../../../src/stages/stage7-enrichments/handlers/nlm-audio-handler';

function createInput(
  settings: Record<string, unknown> = {},
  lessonDurationMinutes?: number | null
): EnrichmentHandlerInput {
  return {
    enrichmentContext: {
      enrichment: {
        id: 'enrichment-audio-1',
        lesson_id: 'lesson-1',
        course_id: 'course-1',
        enrichment_type: 'nlm_audio',
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
        objectives: ['Understand source strategy', 'Compare presets'],
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
      type: 'nlm_audio_draft',
      script: 'Narration script body',
      voice_id: 'alloy',
      format: 'mp3',
      speed: 1,
      duration_seconds: 22,
    },
    metadata: {
      durationMs: 120,
      tokensUsed: 33,
      modelUsed: 'draft-model',
    },
  };
}

describe('stage7 nlm audio handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLessonContent.mockResolvedValue('# Raw Lesson\n\nLesson body');
    mockStartAudio.mockResolvedValue({
      taskId: 'task-audio-1',
      status: 'queued',
      responseMetadata: { provider: 'mock-bridge' },
    });
    mockGetTaskMedia.mockResolvedValue({
      buffer: Buffer.from('audio-bytes'),
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      durationSeconds: 44,
      responseMetadata: { provider: 'mock-bridge' },
    });
  });

  it('builds hybrid source bundle with default audio presets and returns detached task', async () => {
    const result = await nlmAudioHandler.generateFinal!(createInput(), createDraft());

    expect(mockStartAudio).toHaveBeenCalledTimes(1);
    expect(mockGetTaskStatus).not.toHaveBeenCalled();
    expect(mockGetTaskMedia).not.toHaveBeenCalled();

    const request = mockStartAudio.mock.calls[0][0];
    expect(request.courseId).toBe('course-1');
    expect(request.audioFormat).toBe('deep_dive');
    expect(request.audioLength).toBe('default');
    expect(request.targetDurationMinutes).toBe(5);
    expect(request.durationRangeMinMinutes).toBe(4);
    expect(request.durationRangeMaxMinutes).toBe(7);
    expect(request.sources).toHaveLength(3);
    expect(request.sources[0].content).toContain('Narration script body');
    expect(request.sources[1].content).toContain('Raw Lesson');
    expect(request.sources[2].content).toContain('Understand source strategy');

    expect(result.deferredTask).toBeDefined();
    expect(result.deferredTask?.taskId).toBe('task-audio-1');
    expect(result.deferredTask?.mediaType).toBe('audio');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('hybrid');
    expect(additionalInfo.source_count).toBe(3);
    expect(additionalInfo.audio_format_preset).toBe('deep_dive');
    expect(additionalInfo.audio_length_preset).toBe('default');
    expect(additionalInfo.duration_target_minutes).toBe(5);
    expect(additionalInfo.duration_range_min_minutes).toBe(4);
    expect(additionalInfo.duration_range_max_minutes).toBe(7);
  });

  it('respects script-only source strategy and explicit audio presets', async () => {
    const input = createInput({
      nlm_source_strategy: 'script_only',
      nlm_audio_length: 'short',
      nlm_audio_format: 'brief',
    });

    const result = await nlmAudioHandler.generateFinal!(input, createDraft());

    const request = mockStartAudio.mock.calls[0][0];
    expect(request.audioFormat).toBe('brief');
    expect(request.audioLength).toBe('short');
    expect(request.sources).toHaveLength(1);
    expect(request.sources[0].content).toContain('Narration script body');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('script_only');
    expect(additionalInfo.source_count).toBe(1);
    expect(additionalInfo.audio_format_preset).toBe('brief');
    expect(additionalInfo.audio_length_preset).toBe('short');
  });

  it('infers short audio length for short lessons when preset is not explicitly set', async () => {
    await nlmAudioHandler.generateFinal!(createInput({}, 4), createDraft());

    const request = mockStartAudio.mock.calls[0][0];
    expect(request.audioLength).toBe('short');
    expect(request.targetDurationMinutes).toBe(4);
    expect(request.durationRangeMinMinutes).toBe(4);
    expect(request.durationRangeMaxMinutes).toBe(7);
  });

  it('returns deferred task in poll mode when bridge task is still running', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-audio-1',
      status: 'in_progress',
      responseMetadata: { progress: 50 },
    });

    const result = await nlmAudioHandler.generateFinal!(
      createInput({
        __nlm_async_mode: 'poll',
        __nlm_bridge_task_id: 'task-audio-1',
        __nlm_poll_attempt: 2,
      }),
      createDraft()
    );

    expect(mockGetTaskStatus).toHaveBeenCalledWith('task-audio-1', 'audio');
    expect(result.deferredTask?.taskId).toBe('task-audio-1');
    expect(result.deferredTask?.status).toBe('in_progress');
    expect(mockStartAudio).not.toHaveBeenCalled();
    expect(mockGetTaskMedia).not.toHaveBeenCalled();
  });

  it('fetches final media in poll mode when bridge task is completed', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-audio-1',
      status: 'completed',
      responseMetadata: { progress: 100 },
    });

    const result = await nlmAudioHandler.generateFinal!(
      createInput({
        __nlm_async_mode: 'poll',
        __nlm_bridge_task_id: 'task-audio-1',
      }),
      createDraft()
    );

    expect(mockGetTaskStatus).toHaveBeenCalledWith('task-audio-1', 'audio');
    expect(mockGetTaskMedia).toHaveBeenCalledWith('task-audio-1', 'audio');
    expect(result.deferredTask).toBeUndefined();
    expect(result.assetBuffer?.equals(Buffer.from('audio-bytes'))).toBe(true);
  });

  it('surfaces bridge failed status in poll mode for stage7 retry strategy', async () => {
    mockGetTaskStatus.mockResolvedValueOnce({
      taskId: 'task-audio-1',
      status: 'failed',
      responseMetadata: { detail: 'generation failed' },
    });

    await expect(
      nlmAudioHandler.generateFinal!(
        createInput({
          __nlm_async_mode: 'poll',
          __nlm_bridge_task_id: 'task-audio-1',
        }),
        createDraft()
      )
    ).rejects.toThrow(/task failed/i);
  });
});
