import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('notebooklm-bridge-client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls audio endpoint with bearer token and parses data URL response', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    const base64 = Buffer.from('audio-bytes').toString('base64');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          audio_base64: `data:audio/mpeg;base64,${base64}`,
          duration_seconds: 42,
        }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateAudio({
      lessonTitle: 'Lesson 1',
      script: 'Hello world',
      language: 'en',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bridge.local/artifacts/generate-audio',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.extension).toBe('mp3');
    expect(result.durationSeconds).toBe(42);
    expect(result.buffer.equals(Buffer.from('audio-bytes'))).toBe(true);
  });

  it('calls video endpoint and parses plain base64 payload', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    const base64 = Buffer.from('video-bytes').toString('base64');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          base64,
          mime_type: 'video/mp4',
          extension: 'mp4',
        }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    const result = await notebookLmBridgeClient.generateVideoOverview({
      lessonTitle: 'Lesson 1',
      script: 'Script body',
      language: 'en',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bridge.local/video/generate-overview',
      expect.objectContaining({ method: 'POST' })
    );

    expect(result.mimeType).toBe('video/mp4');
    expect(result.extension).toBe('mp4');
    expect(result.buffer.equals(Buffer.from('video-bytes'))).toBe(true);
  });

  it('throws if required bridge configuration is missing', async () => {
    delete process.env.NOTEBOOKLM_BRIDGE_URL;
    delete process.env.NOTEBOOKLM_BRIDGE_TOKEN;

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await expect(
      notebookLmBridgeClient.generateAudio({
        lessonTitle: 'Lesson 1',
        script: 'Hello world',
        language: 'en',
      })
    ).rejects.toThrow(/NOTEBOOKLM_BRIDGE_URL/i);
  });

  it('sends optional hybrid sources and audio presets when provided', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    const base64 = Buffer.from('audio-bytes').toString('base64');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          audio_base64: base64,
          mime_type: 'audio/mpeg',
          extension: 'mp3',
        }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await notebookLmBridgeClient.generateAudio({
      lessonTitle: 'Lesson 1',
      script: 'Primary script',
      language: 'en',
      voice: 'alloy',
      sources: [
        { title: 'Script', content: 'Primary script' },
        { title: 'Raw lesson', content: 'Raw markdown content' },
      ],
      audioFormat: 'deep_dive',
      audioLength: 'default',
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(requestBody).toMatchObject({
      lesson_title: 'Lesson 1',
      script: 'Primary script',
      language: 'en',
      voice: 'alloy',
      audio_format: 'deep_dive',
      audio_length: 'default',
      sources: [
        { title: 'Script', content: 'Primary script' },
        { title: 'Raw lesson', content: 'Raw markdown content' },
      ],
    });
  });

  it('sends optional hybrid sources and video presets when provided', async () => {
    process.env.NOTEBOOKLM_BRIDGE_URL = 'https://bridge.local';
    process.env.NOTEBOOKLM_BRIDGE_TOKEN = 'secret-token';

    const base64 = Buffer.from('video-bytes').toString('base64');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        JSON.stringify({
          video_base64: base64,
          mime_type: 'video/mp4',
          extension: 'mp4',
        }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { notebookLmBridgeClient } = await import(
      '../../../src/stages/stage7-enrichments/services/notebooklm-bridge-client'
    );

    await notebookLmBridgeClient.generateVideoOverview({
      lessonTitle: 'Lesson 1',
      script: 'Video script',
      language: 'en',
      sources: [
        { title: 'Script', content: 'Video script' },
        { title: 'Objectives', content: 'Objective data' },
      ],
      videoFormat: 'explainer',
      videoStyle: 'auto_select',
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(requestBody).toMatchObject({
      lesson_title: 'Lesson 1',
      script: 'Video script',
      language: 'en',
      video_format: 'explainer',
      video_style: 'auto_select',
      sources: [
        { title: 'Script', content: 'Video script' },
        { title: 'Objectives', content: 'Objective data' },
      ],
    });
  });
});
