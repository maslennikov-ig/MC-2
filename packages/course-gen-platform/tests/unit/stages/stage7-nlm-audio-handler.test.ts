import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DraftResult,
  EnrichmentHandlerInput,
} from '../../../src/stages/stage7-enrichments/types';

const { mockGenerateAudio, mockGetLessonContent } = vi.hoisted(() => ({
  mockGenerateAudio: vi.fn(),
  mockGetLessonContent: vi.fn(),
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
  notebookLmBridgeClient: {
    generateAudio: mockGenerateAudio,
  },
}));

vi.mock('../../../src/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: mockGetLessonContent,
}));

import { nlmAudioHandler } from '../../../src/stages/stage7-enrichments/handlers/nlm-audio-handler';

function createInput(settings: Record<string, unknown> = {}): EnrichmentHandlerInput {
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
    mockGenerateAudio.mockResolvedValue({
      buffer: Buffer.from('audio-bytes'),
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      durationSeconds: 44,
      responseMetadata: { provider: 'mock-bridge' },
    });
  });

  it('builds hybrid source bundle with default audio presets', async () => {
    const result = await nlmAudioHandler.generateFinal!(createInput(), createDraft());

    expect(mockGenerateAudio).toHaveBeenCalledTimes(1);

    const request = mockGenerateAudio.mock.calls[0][0];
    expect(request.audioFormat).toBe('deep_dive');
    expect(request.audioLength).toBe('default');
    expect(request.sources).toHaveLength(3);
    expect(request.sources[0].content).toContain('Narration script body');
    expect(request.sources[1].content).toContain('Raw Lesson');
    expect(request.sources[2].content).toContain('Understand source strategy');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('hybrid');
    expect(additionalInfo.source_count).toBe(3);
    expect(additionalInfo.audio_format_preset).toBe('deep_dive');
    expect(additionalInfo.audio_length_preset).toBe('default');
  });

  it('respects script-only source strategy and explicit audio presets', async () => {
    const input = createInput({
      nlm_source_strategy: 'script_only',
      nlm_audio_length: 'short',
      nlm_audio_format: 'brief',
    });

    const result = await nlmAudioHandler.generateFinal!(input, createDraft());

    const request = mockGenerateAudio.mock.calls[0][0];
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
});
