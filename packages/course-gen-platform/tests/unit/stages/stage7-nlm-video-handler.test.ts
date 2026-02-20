import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DraftResult,
  EnrichmentHandlerInput,
} from '../../../src/stages/stage7-enrichments/types';

const { mockGenerateVideoOverview, mockGetLessonContent } = vi.hoisted(() => ({
  mockGenerateVideoOverview: vi.fn(),
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
    generateVideoOverview: mockGenerateVideoOverview,
  },
}));

vi.mock('../../../src/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: mockGetLessonContent,
}));

vi.mock('../../../src/stages/stage7-enrichments/handlers/video-handler', () => ({
  videoHandler: {
    generationFlow: 'two-stage',
    generate: vi.fn(),
    generateDraft: vi.fn(),
  },
}));

import { nlmVideoHandler } from '../../../src/stages/stage7-enrichments/handlers/nlm-video-handler';

function createInput(settings: Record<string, unknown> = {}): EnrichmentHandlerInput {
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
    mockGenerateVideoOverview.mockResolvedValue({
      buffer: Buffer.from('video-bytes'),
      mimeType: 'video/mp4',
      extension: 'mp4',
      durationSeconds: 95,
      responseMetadata: { provider: 'mock-bridge' },
    });
  });

  it('builds hybrid source bundle with default video presets', async () => {
    const result = await nlmVideoHandler.generateFinal!(createInput(), createDraft());

    expect(mockGenerateVideoOverview).toHaveBeenCalledTimes(1);

    const request = mockGenerateVideoOverview.mock.calls[0][0];
    expect(request.videoFormat).toBe('explainer');
    expect(request.videoStyle).toBe('auto_select');
    expect(request.sources).toHaveLength(3);
    expect(request.sources[0].content).toContain('Final video script');
    expect(request.sources[1].content).toContain('Raw Lesson');
    expect(request.sources[2].content).toContain('Explain concept A');

    const additionalInfo = result.metadata.additional_info as Record<string, unknown>;
    expect(additionalInfo.source_strategy_used).toBe('hybrid');
    expect(additionalInfo.source_count).toBe(3);
    expect(additionalInfo.video_format_preset).toBe('explainer');
    expect(additionalInfo.video_style_preset).toBe('auto_select');
  });

  it('respects raw-only source strategy and explicit video presets', async () => {
    const input = createInput({
      nlm_source_strategy: 'raw_only',
      nlm_video_style: 'classic',
      nlm_video_format: 'brief',
    });

    const result = await nlmVideoHandler.generateFinal!(input, createDraft());

    const request = mockGenerateVideoOverview.mock.calls[0][0];
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
});
