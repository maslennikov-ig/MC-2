import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const axiosPostMock = vi.hoisted(() => vi.fn());
const axiosGetMock = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    get: axiosGetMock,
    isAxiosError: (value: unknown) => Boolean((value as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe('notebooklm-bridge-client', () => {
  beforeEach(() => {
    vi.resetModules();
    axiosPostMock.mockReset();
    axiosGetMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('completes audio generation through start/status/result async lifecycle', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    process.env.NOTEBOOKLM_BRIDGE_AUDIO_START_PATH = '/artifacts/start-audio';
    process.env.NOTEBOOKLM_BRIDGE_TASK_STATUS_PATH = '/tasks/status';
    process.env.NOTEBOOKLM_BRIDGE_TASK_RESULT_PATH = '/tasks/result';

    const base64 = Buffer.from('audio-bytes').toString('base64');
    axiosPostMock
      .mockResolvedValueOnce({
        status: 202,
        data: JSON.stringify({
          task_id: 'task-audio-123',
          status: 'queued',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-audio-123',
          status: 'in_progress',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-audio-123',
          status: 'completed',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-audio-123',
          audio_base64: base64,
          mime_type: 'audio/mpeg',
          extension: 'mp3',
          duration_seconds: 42,
        }),
      });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateAudio(
      {
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        courseId: 'course-1',
      },
      {
        timeoutMs: 5_000,
        initialPollDelayMs: 0,
        maxPollDelayMs: 0,
        jitterRatio: 0,
      }
    );

    expect(axiosPostMock).toHaveBeenNthCalledWith(
      1,
      'https://bridge.local/artifacts/start-audio',
      expect.objectContaining({
        lesson_title: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        course_id: 'course-1',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        }),
        timeout: 60 * 60 * 1000,
      })
    );

    expect(axiosPostMock).toHaveBeenNthCalledWith(
      2,
      'https://bridge.local/tasks/status',
      { task_id: 'task-audio-123' },
      expect.any(Object)
    );

    expect(axiosPostMock).toHaveBeenNthCalledWith(
      4,
      'https://bridge.local/tasks/result',
      { task_id: 'task-audio-123' },
      expect.any(Object)
    );

    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.extension).toBe('mp3');
    expect(result.durationSeconds).toBe(42);
    expect(result.buffer.equals(Buffer.from('audio-bytes'))).toBe(true);
  });

  it('uses default async status/result GET endpoints with taskId path placeholders', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    const base64 = Buffer.from('audio-bytes').toString('base64');
    axiosPostMock.mockResolvedValueOnce({
      status: 202,
      data: JSON.stringify({
        task_id: 'task-audio-default-paths',
        status: 'queued',
      }),
    });
    axiosGetMock
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-audio-default-paths',
          status: 'completed',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-audio-default-paths',
          audio_base64: base64,
          mime_type: 'audio/mpeg',
          extension: 'mp3',
        }),
      });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateAudio(
      {
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
      },
      {
        timeoutMs: 2_000,
        initialPollDelayMs: 0,
        maxPollDelayMs: 0,
        jitterRatio: 0,
      }
    );

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://bridge.local/artifacts/generate-audio/start',
      expect.any(Object),
      expect.any(Object)
    );
    expect(axiosGetMock).toHaveBeenNthCalledWith(
      1,
      'https://bridge.local/artifacts/generate-audio/task-audio-default-paths/status',
      expect.any(Object)
    );
    expect(axiosGetMock).toHaveBeenNthCalledWith(
      2,
      'https://bridge.local/artifacts/generate-audio/task-audio-default-paths/result',
      expect.any(Object)
    );
    expect(result.buffer.equals(Buffer.from('audio-bytes'))).toBe(true);
  });

  it('downloads media bytes when task result provides download_url', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    process.env.NOTEBOOKLM_BRIDGE_VIDEO_START_PATH = '/video/start-overview';
    process.env.NOTEBOOKLM_BRIDGE_TASK_STATUS_PATH = '/tasks/status';
    process.env.NOTEBOOKLM_BRIDGE_TASK_RESULT_PATH = '/tasks/result';

    axiosPostMock
      .mockResolvedValueOnce({
        status: 202,
        data: JSON.stringify({
          task_id: 'task-video-123',
          status: 'queued',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-video-123',
          status: 'completed',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-video-123',
          download_url: 'https://storage.local/video.mp4',
          mime_type: 'video/mp4',
          extension: 'mp4',
          duration_seconds: 84,
        }),
      });

    axiosGetMock.mockResolvedValue({
      status: 200,
      data: Buffer.from('video-bytes'),
      headers: {
        'content-type': 'video/mp4',
      },
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateVideoOverview(
      {
        lessonTitle: 'Lesson 1',
        script: 'Video script',
        language: 'en',
        courseId: 'course-1',
      },
      {
        timeoutMs: 5_000,
        initialPollDelayMs: 0,
        maxPollDelayMs: 0,
        jitterRatio: 0,
      }
    );

    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://storage.local/video.mp4',
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 60 * 60 * 1000,
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      })
    );

    expect(result.mimeType).toBe('video/mp4');
    expect(result.extension).toBe('mp4');
    expect(result.durationSeconds).toBe(84);
    expect(result.buffer.equals(Buffer.from('video-bytes'))).toBe(true);
  });

  it('surfaces retryable timeout error when task polling exceeds timeout', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    process.env.NOTEBOOKLM_BRIDGE_AUDIO_START_PATH = '/artifacts/start-audio';
    process.env.NOTEBOOKLM_BRIDGE_TASK_STATUS_PATH = '/tasks/status';

    axiosPostMock
      .mockResolvedValueOnce({
        status: 202,
        data: JSON.stringify({
          task_id: 'task-timeout-1',
          status: 'queued',
        }),
      })
      .mockResolvedValue({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-timeout-1',
          status: 'in_progress',
        }),
      });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.generateAudio(
        {
          lessonTitle: 'Lesson 1',
          script: 'Hello world',
          language: 'en',
          courseId: 'course-1',
        },
        {
          timeoutMs: 5,
          initialPollDelayMs: 10,
          maxPollDelayMs: 10,
          jitterRatio: 0,
        }
      )
    ).rejects.toThrow(/timed out/i);
  });

  it('supports backward-compatible blocking payloads from start endpoint', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    process.env.NOTEBOOKLM_BRIDGE_AUDIO_START_PATH = '/artifacts/generate-audio';

    const base64 = Buffer.from('audio-bytes').toString('base64');
    axiosPostMock.mockResolvedValue({
      status: 200,
      data: JSON.stringify({
        audio_base64: `data:audio/mpeg;base64,${base64}`,
        duration_seconds: 42,
      }),
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateAudio({
      lessonTitle: 'Lesson 1',
      script: 'Hello world',
      language: 'en',
      courseId: 'course-1',
    });

    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://bridge.local/artifacts/generate-audio',
      expect.objectContaining({
        lesson_title: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        course_id: 'course-1',
      }),
      expect.objectContaining({
        timeout: 60 * 60 * 1000,
      })
    );

    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.extension).toBe('mp3');
    expect(result.durationSeconds).toBe(42);
    expect(result.buffer.equals(Buffer.from('audio-bytes'))).toBe(true);
  });

  it('exposes explicit low-level lifecycle methods', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    process.env.NOTEBOOKLM_BRIDGE_AUDIO_START_PATH = '/artifacts/start-audio';
    process.env.NOTEBOOKLM_BRIDGE_TASK_STATUS_PATH = '/tasks/status';
    process.env.NOTEBOOKLM_BRIDGE_TASK_RESULT_PATH = '/tasks/result';

    axiosPostMock
      .mockResolvedValueOnce({
        status: 202,
        data: JSON.stringify({
          task_id: 'task-bridge-low-level',
          status: 'queued',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-bridge-low-level',
          status: 'in_progress',
          progress: 35,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: JSON.stringify({
          task_id: 'task-bridge-low-level',
          download_url: 'https://storage.local/audio.mp3',
          mime_type: 'audio/mpeg',
          extension: 'mp3',
        }),
      });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const start = await notebookLmBridgeClient.startAudio({
      lessonTitle: 'Lesson 1',
      script: 'Script body',
      language: 'en',
      courseId: 'course-1',
    });

    const status = await notebookLmBridgeClient.getTaskStatus(start.taskId, 'audio');
    const taskResult = await notebookLmBridgeClient.getTaskResult(start.taskId, 'audio');

    expect(start.taskId).toBe('task-bridge-low-level');
    expect(start.status).toBe('queued');
    expect(status.status).toBe('in_progress');
    expect(status.progress).toBe(35);
    expect(taskResult.payload.download_url).toBe('https://storage.local/audio.mp3');
  });

  it('throws if required bridge configuration is missing', async () => {
    delete process.env.NOTEBOOKLM_BRIDGE_URL;
    delete process.env.NOTEBOOKLM_BRIDGE_TOKEN;

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.startAudio({
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        courseId: 'course-1',
      })
    ).rejects.toThrow(/NOTEBOOKLM_BRIDGE_URL/i);
  });

  it('returns informative timeout error when bridge request exceeds timeout', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    axiosPostMock.mockRejectedValue({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout exceeded',
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.startAudio({
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        courseId: 'course-1',
      })
    ).rejects.toThrow('NotebookLM bridge request timed out after 3600000ms');
  });

  it('returns informative network error when bridge request fails before response', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    axiosPostMock.mockRejectedValue({
      isAxiosError: true,
      code: 'ECONNRESET',
      message: 'socket hang up',
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.startAudio({
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        courseId: 'course-1',
      })
    ).rejects.toThrow('NotebookLM bridge network request failed: socket hang up');
  });

  it('preserves bridge status code details for non-2xx responses', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    axiosPostMock.mockResolvedValue({
      status: 502,
      data: JSON.stringify({ detail: 'Audio generation failed' }),
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.startAudio({
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
        courseId: 'course-1',
      })
    ).rejects.toThrow(/NotebookLM bridge request failed \(502\)/i);
  });

  it('uses 60-minute timeout by default when NOTEBOOKLM_BRIDGE_TIMEOUT_MS is not set', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';
    delete process.env.NOTEBOOKLM_BRIDGE_TIMEOUT_MS;

    axiosPostMock.mockResolvedValue({
      status: 202,
      data: JSON.stringify({ task_id: 'task-timeout-default', status: 'queued' }),
    });

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await notebookLmBridgeClient.startAudio({
      lessonTitle: 'Lesson 1',
      script: 'Hello world',
      language: 'en',
      courseId: 'course-1',
    });

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://bridge.local/artifacts/generate-audio/start',
      expect.any(Object),
      expect.objectContaining({
        timeout: 60 * 60 * 1000,
      })
    );
  });
});
