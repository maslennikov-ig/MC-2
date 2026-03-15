import { SUCCESS_TASK_STATUSES, FAILED_TASK_STATUSES } from './constants.js';
import type {
  NotebookLMBridgeMediaResult,
  NotebookLMBridgeMediaType,
  MediaDefaults,
  NotebookLMSourceInput,
} from './types.js';

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function getNumberValue(
  payload: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function getDurationSeconds(payload: Record<string, unknown>): number | undefined {
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

export function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/flac') return 'flac';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/webm') return 'webm';
  if (normalized === 'text/markdown') return 'md';
  if (normalized === 'application/json') return 'json';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  return 'bin';
}

export function decodeBase64(value: string): Buffer {
  const cleaned = value.replace(/\s+/g, '');
  const validBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);

  if (!validBase64) {
    throw new Error('NotebookLM bridge returned invalid base64 data');
  }

  return Buffer.from(cleaned, 'base64');
}

export function normalizeSources(
  sources: NotebookLMSourceInput[] | undefined
): NotebookLMSourceInput[] {
  if (!sources || sources.length === 0) {
    return [];
  }

  return sources
    .map(source => {
      const title = source.title?.trim();
      const content = source.content?.trim();
      if (!title || !content) {
        return null;
      }

      return { title, content };
    })
    .filter((value): value is NotebookLMSourceInput => value !== null);
}

export function getMediaPayloadCandidates(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [payload];

  for (const key of ['result', 'artifact', 'media', 'data', 'output']) {
    const nested = asObject(payload[key]);
    if (nested) {
      candidates.push(nested);
    }
  }

  return candidates;
}

export function hasEmbeddedMediaPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    getStringValue(payload, [
      'audio_base64',
      'video_base64',
      'image_base64',
      'file_base64',
      'base64',
      'base64_data',
      'data',
    ])
  );
}

export function parseMediaPayload(
  payload: Record<string, unknown>,
  defaults: MediaDefaults
): NotebookLMBridgeMediaResult {
  const base64Value = getStringValue(payload, [
    'audio_base64',
    'video_base64',
    'image_base64',
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

export function isTextMediaType(mediaType: NotebookLMBridgeMediaType): boolean {
  return mediaType === 'study_guide' || mediaType === 'flashcards' || mediaType === 'mind_map';
}

export function parseTextPayload(
  payload: Record<string, unknown>,
  defaults: MediaDefaults
): NotebookLMBridgeMediaResult | null {
  const candidates = getMediaPayloadCandidates(payload);

  for (const candidate of candidates) {
    const content = getStringValue(candidate, ['content', 'text', 'markdown', 'data']);
    if (content) {
      const buffer = Buffer.from(content, 'utf-8');
      const mimeType =
        getStringValue(candidate, ['content_type', 'contentType', 'mime_type', 'mimeType']) ??
        defaults.mimeType;
      return {
        buffer,
        mimeType,
        extension: extensionFromMimeType(mimeType),
        textContent: content,
      };
    }
  }

  return null;
}

export function extractDownloadUrl(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, [
    'download_url',
    'downloadUrl',
    'artifact_url',
    'artifactUrl',
    'url',
  ]);
}

export function extractTaskId(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, ['task_id', 'taskId', 'id', 'job_id', 'jobId']);
}

export function extractTaskStatus(payload: Record<string, unknown>): string {
  const raw =
    getStringValue(payload, ['status', 'task_status', 'taskStatus', 'state']) ?? 'unknown';
  return raw.toLowerCase();
}

export function extractTaskError(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, ['error', 'error_message', 'errorMessage', 'detail', 'message']);
}

export function extractTaskProgress(payload: Record<string, unknown>): number | undefined {
  const progress = getNumberValue(payload, ['progress', 'progress_percent', 'progressPercent']);
  if (progress === undefined) {
    return undefined;
  }

  if (Number.isFinite(progress) && progress >= 0) {
    return progress;
  }

  return undefined;
}

export function getMediaDefaults(mediaType: NotebookLMBridgeMediaType): MediaDefaults {
  switch (mediaType) {
    case 'audio':
      return { mimeType: 'audio/mpeg', extension: 'mp3' };
    case 'video':
      return { mimeType: 'video/mp4', extension: 'mp4' };
    case 'study_guide':
      return { mimeType: 'text/markdown', extension: 'md' };
    case 'flashcards':
    case 'mind_map':
      return { mimeType: 'application/json', extension: 'json' };
    case 'infographic':
      return { mimeType: 'image/png', extension: 'png' };
  }
}

export function isSuccessfulTaskStatus(status: string): boolean {
  return SUCCESS_TASK_STATUSES.has(status);
}

export function isFailedTaskStatus(status: string): boolean {
  return FAILED_TASK_STATUSES.has(status);
}

export function isNotebookLMTaskSuccessfulStatus(status: string): boolean {
  return isSuccessfulTaskStatus(status.trim().toLowerCase());
}

export function isNotebookLMTaskFailedStatus(status: string): boolean {
  return isFailedTaskStatus(status.trim().toLowerCase());
}
