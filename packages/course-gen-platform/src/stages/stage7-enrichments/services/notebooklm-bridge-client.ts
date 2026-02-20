/**
 * NotebookLM Bridge Client
 * @module stages/stage7-enrichments/services/notebooklm-bridge-client
 *
 * HTTP client for calling an internal NotebookLM bridge service.
 * Used by Stage 7 NLM handlers for final audio/video artifact generation.
 */

import { logger } from '@/shared/logger';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const AUDIO_DEFAULT_PATH = '/artifacts/generate-audio';
const VIDEO_DEFAULT_PATH = '/video/generate-overview';

interface NotebookLMBridgeConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  audioPath: string;
  videoPath: string;
}

interface MediaDefaults {
  mimeType: string;
  extension: string;
}

export interface NotebookLMBridgeGenerateRequest {
  lessonTitle: string;
  script: string;
  language: string;
  voice?: string;
}

export interface NotebookLMBridgeMediaResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  durationSeconds?: number;
  responseMetadata?: Record<string, unknown>;
}

function normalizePath(pathValue: string, fallback: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function getBridgeConfig(): NotebookLMBridgeConfig {
  const rawBaseUrl =
    process.env.NOTEBOOKLM_BRIDGE_URL ?? process.env.NOTEBOOKLM_BRIDGE_BASE_URL ?? '';
  const rawToken = process.env.NOTEBOOKLM_BRIDGE_TOKEN ?? process.env.NOTEBOOKLM_TOKEN ?? '';

  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
  const token = rawToken.trim();

  if (!baseUrl) {
    throw new Error('NOTEBOOKLM_BRIDGE_URL environment variable is not set');
  }

  if (!token) {
    throw new Error('NOTEBOOKLM_BRIDGE_TOKEN environment variable is not set');
  }

  const timeoutMsRaw = process.env.NOTEBOOKLM_BRIDGE_TIMEOUT_MS?.trim();
  const parsedTimeout = timeoutMsRaw ? Number(timeoutMsRaw) : Number.NaN;
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl,
    token,
    timeoutMs,
    audioPath: normalizePath(process.env.NOTEBOOKLM_BRIDGE_AUDIO_PATH ?? '', AUDIO_DEFAULT_PATH),
    videoPath: normalizePath(process.env.NOTEBOOKLM_BRIDGE_VIDEO_PATH ?? '', VIDEO_DEFAULT_PATH),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getDurationSeconds(payload: Record<string, unknown>): number | undefined {
  const candidates = [
    payload.duration_seconds,
    payload.durationSeconds,
    payload.estimated_duration_seconds,
    payload.estimatedDurationSeconds,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return undefined;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/flac') return 'flac';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/webm') return 'webm';
  return 'bin';
}

function decodeBase64(value: string): Buffer {
  const cleaned = value.replace(/\s+/g, '');
  const validBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);

  if (!validBase64) {
    throw new Error('NotebookLM bridge returned invalid base64 data');
  }

  return Buffer.from(cleaned, 'base64');
}

function parseMediaPayload(
  payload: Record<string, unknown>,
  defaults: MediaDefaults
): NotebookLMBridgeMediaResult {
  const base64Value = getStringValue(payload, [
    'audio_base64',
    'video_base64',
    'file_base64',
    'base64',
    'base64_data',
    'data',
  ]);

  if (!base64Value) {
    throw new Error('NotebookLM bridge response did not include base64 artifact data');
  }

  let mimeType =
    getStringValue(payload, ['mime_type', 'mimeType', 'content_type', 'contentType']) ??
    defaults.mimeType;
  let extension =
    getStringValue(payload, ['extension', 'ext', 'format', 'file_extension']) ?? defaults.extension;
  let base64Data = base64Value;

  // Supports data URL shape: data:audio/mpeg;base64,...
  const dataUrlMatch = base64Value.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64Data = dataUrlMatch[2];
    extension = extensionFromMimeType(mimeType);
  }

  const buffer = decodeBase64(base64Data);

  if (!extension || extension === 'bin') {
    extension = extensionFromMimeType(mimeType);
  }

  return {
    buffer,
    mimeType,
    extension,
    durationSeconds: getDurationSeconds(payload),
  };
}

async function postToBridge(
  path: string,
  body: Record<string, unknown>,
  config: NotebookLMBridgeConfig
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const url = `${config.baseUrl}${path}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `NotebookLM bridge request failed (${response.status}): ${text.slice(0, 300)}`
      );
    }

    if (!text.trim()) {
      throw new Error('NotebookLM bridge returned an empty response body');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `NotebookLM bridge returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const payload = asObject(parsed);
    if (!payload) {
      throw new Error('NotebookLM bridge returned a non-object JSON payload');
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export class NotebookLMBridgeClient {
  async generateAudio(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getBridgeConfig();

    const payload = await postToBridge(
      config.audioPath,
      {
        lesson_title: request.lessonTitle,
        script: request.script,
        language: request.language,
        voice: request.voice,
        workflow: 'artifacts.generate_audio',
      },
      config
    );

    const media = parseMediaPayload(payload, {
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    });

    return {
      ...media,
      responseMetadata: payload,
    };
  }

  async generateVideoOverview(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getBridgeConfig();

    const payload = await postToBridge(
      config.videoPath,
      {
        lesson_title: request.lessonTitle,
        script: request.script,
        language: request.language,
        workflow: 'video_overview',
      },
      config
    );

    const media = parseMediaPayload(payload, {
      mimeType: 'video/mp4',
      extension: 'mp4',
    });

    return {
      ...media,
      responseMetadata: payload,
    };
  }
}

export const notebookLmBridgeClient = new NotebookLMBridgeClient();

export function isNotebookLMBridgeConfigured(): boolean {
  return Boolean(
    (process.env.NOTEBOOKLM_BRIDGE_URL || process.env.NOTEBOOKLM_BRIDGE_BASE_URL) &&
      (process.env.NOTEBOOKLM_BRIDGE_TOKEN || process.env.NOTEBOOKLM_TOKEN)
  );
}

export function getNotebookLMBridgeEndpointSummary(): {
  audioEndpoint: string;
  videoEndpoint: string;
} | null {
  if (!isNotebookLMBridgeConfigured()) {
    return null;
  }

  try {
    const config = getBridgeConfig();
    return {
      audioEndpoint: `${config.baseUrl}${config.audioPath}`,
      videoEndpoint: `${config.baseUrl}${config.videoPath}`,
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'NotebookLM bridge endpoint summary unavailable'
    );
    return null;
  }
}
