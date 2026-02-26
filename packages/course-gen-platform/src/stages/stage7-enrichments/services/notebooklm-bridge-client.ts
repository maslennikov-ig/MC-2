/**
 * NotebookLM Bridge Client
 * @module stages/stage7-enrichments/services/notebooklm-bridge-client
 *
 * HTTP client for calling an internal NotebookLM bridge service.
 * Used by Stage 7 NLM handlers for final audio/video artifact generation.
 */

import { logger } from '@/shared/logger';
import axios from 'axios';

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INITIAL_DELAY_MS = 5_000;
const DEFAULT_POLL_MAX_DELAY_MS = 30_000;
const DEFAULT_POLL_JITTER_RATIO = 0.2;

const AUDIO_DEFAULT_PATH = '/artifacts/generate-audio';
const VIDEO_DEFAULT_PATH = '/video/generate-overview';
const AUDIO_START_DEFAULT_PATH = '/artifacts/generate-audio/start';
const VIDEO_START_DEFAULT_PATH = '/video/generate-overview/start';
const AUDIO_TASK_STATUS_DEFAULT_PATH = '/artifacts/generate-audio/{taskId}/status';
const VIDEO_TASK_STATUS_DEFAULT_PATH = '/video/generate-overview/{taskId}/status';
const AUDIO_TASK_RESULT_DEFAULT_PATH = '/artifacts/generate-audio/{taskId}/result';
const VIDEO_TASK_RESULT_DEFAULT_PATH = '/video/generate-overview/{taskId}/result';
const INLINE_TASK_ID = 'inline-result';

const SUCCESS_TASK_STATUSES = new Set([
  'completed',
  'complete',
  'done',
  'success',
  'succeeded',
  'ready',
  'finished',
]);

const FAILED_TASK_STATUSES = new Set([
  'failed',
  'failure',
  'error',
  'cancelled',
  'canceled',
  'timed_out',
  'timeout',
]);

interface MediaDefaults {
  mimeType: string;
  extension: string;
}

export interface NotebookLMSourceInput {
  title: string;
  content: string;
}

export type NotebookLMAudioFormatPreset = 'deep_dive' | 'brief' | 'critique' | 'debate';
export type NotebookLMAudioLengthPreset = 'short' | 'default' | 'long';
export type NotebookLMVideoFormatPreset = 'explainer' | 'brief';
export type NotebookLMVideoStylePreset =
  | 'auto_select'
  | 'custom'
  | 'classic'
  | 'whiteboard'
  | 'kawaii'
  | 'anime'
  | 'watercolor'
  | 'retro_print'
  | 'heritage'
  | 'paper_craft';

export interface NotebookLMBridgeGenerateRequest {
  lessonTitle: string;
  script: string;
  language: string;
  courseId?: string;
  voice?: string;
  targetDurationMinutes?: number;
  durationRangeMinMinutes?: number;
  durationRangeMaxMinutes?: number;
  sources?: NotebookLMSourceInput[];
  audioFormat?: NotebookLMAudioFormatPreset;
  audioLength?: NotebookLMAudioLengthPreset;
  videoFormat?: NotebookLMVideoFormatPreset;
  videoStyle?: NotebookLMVideoStylePreset;
}

export interface NotebookLMBridgeMediaResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  durationSeconds?: number;
  responseMetadata?: Record<string, unknown>;
}

export interface NotebookLMBridgeWaitOptions {
  timeoutMs: number;
  initialPollDelayMs: number;
  maxPollDelayMs: number;
  jitterRatio: number;
}

export type NotebookLMBridgeWaitOptionsInput = Partial<NotebookLMBridgeWaitOptions>;

export interface NotebookLMBridgeTaskStartResult {
  taskId: string;
  status: string;
  responseMetadata: Record<string, unknown>;
  immediateMedia?: NotebookLMBridgeMediaResult;
}

export interface NotebookLMBridgeTaskStatusResult {
  taskId: string;
  status: string;
  progress?: number;
  responseMetadata: Record<string, unknown>;
}

export interface NotebookLMBridgeTaskResult {
  taskId: string;
  status?: string;
  payload: Record<string, unknown>;
}

interface NotebookLMBridgeConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  pollRequestTimeoutMs: number;
  audioPath: string;
  videoPath: string;
  audioStartPath: string;
  videoStartPath: string;
  audioTaskStatusPath: string;
  videoTaskStatusPath: string;
  audioTaskResultPath: string;
  videoTaskResultPath: string;
  defaultWaitOptions: NotebookLMBridgeWaitOptions;
}

type NotebookLMBridgeMediaType = 'audio' | 'video';

function normalizePath(pathValue: string, fallback: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parsePositiveNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function parseNonNegativeNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
}

function parseJitterRatio(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }

  return fallback;
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

  const timeoutMs = parsePositiveNumber(
    process.env.NOTEBOOKLM_BRIDGE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const pollRequestTimeoutMs = parsePositiveNumber(
    process.env.NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS,
    DEFAULT_POLL_REQUEST_TIMEOUT_MS
  );
  const audioPath = normalizePath(
    process.env.NOTEBOOKLM_BRIDGE_AUDIO_PATH ?? '',
    AUDIO_DEFAULT_PATH
  );
  const videoPath = normalizePath(
    process.env.NOTEBOOKLM_BRIDGE_VIDEO_PATH ?? '',
    VIDEO_DEFAULT_PATH
  );
  const legacyTaskStatusPath = process.env.NOTEBOOKLM_BRIDGE_TASK_STATUS_PATH?.trim() || '';
  const legacyTaskResultPath = process.env.NOTEBOOKLM_BRIDGE_TASK_RESULT_PATH?.trim() || '';

  const initialPollDelayMs = parseNonNegativeNumber(
    process.env.NOTEBOOKLM_BRIDGE_POLL_INTERVAL_MS,
    DEFAULT_POLL_INITIAL_DELAY_MS
  );
  const maxPollDelayMs = parseNonNegativeNumber(
    process.env.NOTEBOOKLM_BRIDGE_POLL_MAX_INTERVAL_MS,
    DEFAULT_POLL_MAX_DELAY_MS
  );

  return {
    baseUrl,
    token,
    timeoutMs,
    pollRequestTimeoutMs,
    audioPath,
    videoPath,
    audioStartPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_AUDIO_START_PATH ?? '',
      AUDIO_START_DEFAULT_PATH
    ),
    videoStartPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_VIDEO_START_PATH ?? '',
      VIDEO_START_DEFAULT_PATH
    ),
    audioTaskStatusPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_AUDIO_TASK_STATUS_PATH ?? legacyTaskStatusPath,
      AUDIO_TASK_STATUS_DEFAULT_PATH
    ),
    videoTaskStatusPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_VIDEO_TASK_STATUS_PATH ?? legacyTaskStatusPath,
      VIDEO_TASK_STATUS_DEFAULT_PATH
    ),
    audioTaskResultPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_AUDIO_TASK_RESULT_PATH ?? legacyTaskResultPath,
      AUDIO_TASK_RESULT_DEFAULT_PATH
    ),
    videoTaskResultPath: normalizePath(
      process.env.NOTEBOOKLM_BRIDGE_VIDEO_TASK_RESULT_PATH ?? legacyTaskResultPath,
      VIDEO_TASK_RESULT_DEFAULT_PATH
    ),
    defaultWaitOptions: {
      timeoutMs: parsePositiveNumber(process.env.NOTEBOOKLM_BRIDGE_TASK_TIMEOUT_MS, timeoutMs),
      initialPollDelayMs,
      maxPollDelayMs: Math.max(maxPollDelayMs, initialPollDelayMs),
      jitterRatio: parseJitterRatio(
        process.env.NOTEBOOKLM_BRIDGE_POLL_JITTER_RATIO,
        DEFAULT_POLL_JITTER_RATIO
      ),
    },
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

function getNumberValue(payload: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
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

function normalizeSources(sources: NotebookLMSourceInput[] | undefined): NotebookLMSourceInput[] {
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

function getMediaPayloadCandidates(payload: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [payload];

  for (const key of ['result', 'artifact', 'media', 'data', 'output']) {
    const nested = asObject(payload[key]);
    if (nested) {
      candidates.push(nested);
    }
  }

  return candidates;
}

function hasEmbeddedMediaPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    getStringValue(payload, [
      'audio_base64',
      'video_base64',
      'file_base64',
      'base64',
      'base64_data',
      'data',
    ])
  );
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

function extractDownloadUrl(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, [
    'download_url',
    'downloadUrl',
    'artifact_url',
    'artifactUrl',
    'url',
  ]);
}

function extractTaskId(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, ['task_id', 'taskId', 'id', 'job_id', 'jobId']);
}

function extractTaskStatus(payload: Record<string, unknown>): string {
  const raw =
    getStringValue(payload, ['status', 'task_status', 'taskStatus', 'state']) ?? 'unknown';
  return raw.toLowerCase();
}

function extractTaskError(payload: Record<string, unknown>): string | null {
  return getStringValue(payload, ['error', 'error_message', 'errorMessage', 'detail', 'message']);
}

function extractTaskProgress(payload: Record<string, unknown>): number | undefined {
  const progress = getNumberValue(payload, ['progress', 'progress_percent', 'progressPercent']);
  if (progress === undefined) {
    return undefined;
  }

  if (Number.isFinite(progress) && progress >= 0) {
    return progress;
  }

  return undefined;
}

function getMediaDefaults(mediaType: NotebookLMBridgeMediaType): MediaDefaults {
  if (mediaType === 'audio') {
    return {
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    };
  }

  return {
    mimeType: 'video/mp4',
    extension: 'mp4',
  };
}

function isSuccessfulTaskStatus(status: string): boolean {
  return SUCCESS_TASK_STATUSES.has(status);
}

function isFailedTaskStatus(status: string): boolean {
  return FAILED_TASK_STATUSES.has(status);
}

export function isNotebookLMTaskSuccessfulStatus(status: string): boolean {
  return isSuccessfulTaskStatus(status.trim().toLowerCase());
}

export function isNotebookLMTaskFailedStatus(status: string): boolean {
  return isFailedTaskStatus(status.trim().toLowerCase());
}

function resolveTaskPath(
  pathValue: string,
  taskId: string
): { path: string; body?: Record<string, unknown> } {
  if (pathValue.includes('{taskId}')) {
    return {
      path: pathValue.replaceAll('{taskId}', encodeURIComponent(taskId)),
    };
  }

  if (pathValue.includes(':taskId')) {
    return {
      path: pathValue.replaceAll(':taskId', encodeURIComponent(taskId)),
    };
  }

  return {
    path: pathValue,
    body: { task_id: taskId },
  };
}

function resolveWaitOptions(
  config: NotebookLMBridgeConfig,
  overrides?: NotebookLMBridgeWaitOptionsInput
): NotebookLMBridgeWaitOptions {
  const timeoutMs = overrides?.timeoutMs ?? config.defaultWaitOptions.timeoutMs;
  const initialPollDelayMs =
    overrides?.initialPollDelayMs ?? config.defaultWaitOptions.initialPollDelayMs;
  const maxPollDelayMs = overrides?.maxPollDelayMs ?? config.defaultWaitOptions.maxPollDelayMs;
  const jitterRatio = overrides?.jitterRatio ?? config.defaultWaitOptions.jitterRatio;

  return {
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : config.defaultWaitOptions.timeoutMs,
    initialPollDelayMs:
      Number.isFinite(initialPollDelayMs) && initialPollDelayMs >= 0
        ? initialPollDelayMs
        : config.defaultWaitOptions.initialPollDelayMs,
    maxPollDelayMs:
      Number.isFinite(maxPollDelayMs) && maxPollDelayMs >= 0
        ? Math.max(maxPollDelayMs, initialPollDelayMs)
        : config.defaultWaitOptions.maxPollDelayMs,
    jitterRatio:
      Number.isFinite(jitterRatio) && jitterRatio >= 0 && jitterRatio <= 1
        ? jitterRatio
        : config.defaultWaitOptions.jitterRatio,
  };
}

function applyJitter(delayMs: number, jitterRatio: number): number {
  if (delayMs <= 0 || jitterRatio <= 0) {
    return Math.max(0, Math.round(delayMs));
  }

  const jitterWindow = delayMs * jitterRatio;
  const jittered = delayMs - jitterWindow + Math.random() * jitterWindow * 2;
  return Math.max(0, Math.round(jittered));
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise(resolve => {
    setTimeout(resolve, delayMs);
  });
}

function getBridgeRequestHeaders(config: NotebookLMBridgeConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };
}

async function postToBridge(
  path: string,
  body: Record<string, unknown> | undefined,
  config: NotebookLMBridgeConfig,
  timeoutMsOverride?: number
): Promise<Record<string, unknown>> {
  const url = `${config.baseUrl}${path}`;
  let responseText = '';
  const timeoutMs = timeoutMsOverride ?? config.timeoutMs;

  try {
    const response = await axios.post<string>(url, body, {
      headers: getBridgeRequestHeaders(config),
      timeout: timeoutMs,
      responseType: 'text',
      transformResponse: [(value: string) => value],
      validateStatus: () => true,
    });

    responseText = response.data;

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `NotebookLM bridge request failed (${response.status}): ${responseText.slice(0, 300)}`
      );
    }

    if (!responseText.trim()) {
      throw new Error('NotebookLM bridge returned an empty response body');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
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
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`NotebookLM bridge request timed out after ${timeoutMs}ms`);
      }

      throw new Error(
        `NotebookLM bridge network request failed: ${error.message || 'Unknown network error'}`
      );
    }

    throw error;
  }
}

async function getFromBridge(
  path: string,
  config: NotebookLMBridgeConfig,
  timeoutMsOverride?: number
): Promise<Record<string, unknown>> {
  const url = `${config.baseUrl}${path}`;
  let responseText = '';
  const timeoutMs = timeoutMsOverride ?? config.timeoutMs;

  try {
    const response = await axios.get<string>(url, {
      headers: getBridgeRequestHeaders(config),
      timeout: timeoutMs,
      responseType: 'text',
      transformResponse: [(value: string) => value],
      validateStatus: () => true,
    });

    responseText = response.data;

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `NotebookLM bridge request failed (${response.status}): ${responseText.slice(0, 300)}`
      );
    }

    if (!responseText.trim()) {
      throw new Error('NotebookLM bridge returned an empty response body');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
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
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`NotebookLM bridge request timed out after ${timeoutMs}ms`);
      }

      throw new Error(
        `NotebookLM bridge network request failed: ${error.message || 'Unknown network error'}`
      );
    }

    throw error;
  }
}

function shouldFallbackToLegacyStartPath(
  error: unknown,
  startPath: string,
  legacyPath: string
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (startPath === legacyPath) {
    return false;
  }

  return /request failed \(404\)/i.test(error.message);
}

async function downloadFromUrl(
  url: string,
  defaults: MediaDefaults,
  config: NotebookLMBridgeConfig
): Promise<NotebookLMBridgeMediaResult> {
  try {
    const response = await axios.get<ArrayBuffer | Uint8Array | Buffer>(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      timeout: config.timeoutMs,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`NotebookLM bridge download failed (${response.status})`);
    }

    const rawData = response.data;
    if (rawData === undefined || rawData === null) {
      throw new Error('NotebookLM bridge download returned an empty body');
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(rawData)) {
      buffer = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(rawData));
    } else if (ArrayBuffer.isView(rawData)) {
      buffer = Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    } else {
      throw new Error('NotebookLM bridge download returned an unsupported payload type');
    }

    if (buffer.length === 0) {
      throw new Error('NotebookLM bridge download returned an empty body');
    }

    const responseHeaders = asObject(response.headers as unknown);
    const headerValue = responseHeaders?.['content-type'];
    const responseMimeType =
      typeof headerValue === 'string'
        ? headerValue.split(';')[0].trim().toLowerCase()
        : defaults.mimeType;

    return {
      buffer,
      mimeType: responseMimeType || defaults.mimeType,
      extension: extensionFromMimeType(responseMimeType || defaults.mimeType),
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`NotebookLM bridge download timed out after ${config.timeoutMs}ms`);
      }

      throw new Error(
        `NotebookLM bridge download network request failed: ${error.message || 'Unknown network error'}`
      );
    }

    throw error;
  }
}

let cachedBridgeConfig: NotebookLMBridgeConfig | null = null;

function getOrCreateBridgeConfig(): NotebookLMBridgeConfig {
  if (!cachedBridgeConfig) {
    cachedBridgeConfig = getBridgeConfig();
  }
  return cachedBridgeConfig;
}

export class NotebookLMBridgeClient {
  private buildRequestBody(
    request: NotebookLMBridgeGenerateRequest,
    sources: NotebookLMSourceInput[]
  ): Record<string, unknown> {
    return {
      lesson_title: request.lessonTitle,
      script: request.script,
      language: request.language,
      course_id: request.courseId,
      voice: request.voice,
      target_duration_minutes: request.targetDurationMinutes,
      duration_range_min_minutes: request.durationRangeMinMinutes,
      duration_range_max_minutes: request.durationRangeMaxMinutes,
      sources: sources.length > 0 ? sources : undefined,
    };
  }

  private parseStartResponse(
    payload: Record<string, unknown>,
    defaults: MediaDefaults
  ): NotebookLMBridgeTaskStartResult {
    const status = extractTaskStatus(payload);

    for (const candidate of getMediaPayloadCandidates(payload)) {
      if (hasEmbeddedMediaPayload(candidate)) {
        const immediateMedia = parseMediaPayload(candidate, defaults);
        return {
          taskId: extractTaskId(payload) ?? INLINE_TASK_ID,
          status,
          responseMetadata: payload,
          immediateMedia: {
            ...immediateMedia,
            responseMetadata: payload,
          },
        };
      }
    }

    const taskId = extractTaskId(payload);
    if (!taskId) {
      throw new Error('NotebookLM bridge start response did not include task_id');
    }

    return {
      taskId,
      status,
      responseMetadata: payload,
    };
  }

  private async resolveMediaFromTaskResult(
    taskResult: NotebookLMBridgeTaskResult,
    defaults: MediaDefaults,
    config: NotebookLMBridgeConfig
  ): Promise<NotebookLMBridgeMediaResult> {
    const candidates = getMediaPayloadCandidates(taskResult.payload);

    for (const candidate of candidates) {
      if (hasEmbeddedMediaPayload(candidate)) {
        const media = parseMediaPayload(candidate, defaults);
        return {
          ...media,
          responseMetadata: taskResult.payload,
        };
      }
    }

    for (const candidate of candidates) {
      const downloadUrl = extractDownloadUrl(candidate);
      if (!downloadUrl) {
        continue;
      }

      const downloaded = await downloadFromUrl(downloadUrl, defaults, config);
      return {
        ...downloaded,
        durationSeconds: getDurationSeconds(candidate) ?? getDurationSeconds(taskResult.payload),
        responseMetadata: {
          ...taskResult.payload,
          download_url: downloadUrl,
        },
      };
    }

    throw new Error(
      `NotebookLM bridge task result did not include media payload or download URL (taskId=${taskResult.taskId})`
    );
  }

  async startAudio(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    const sources = normalizeSources(request.sources);
    const body = {
      ...this.buildRequestBody(request, sources),
      audio_format: request.audioFormat,
      audio_length: request.audioLength,
    };

    let payload: Record<string, unknown>;
    try {
      payload = await postToBridge(config.audioStartPath, body, config);
    } catch (error) {
      if (!shouldFallbackToLegacyStartPath(error, config.audioStartPath, config.audioPath)) {
        throw error;
      }

      logger.warn(
        {
          startPath: config.audioStartPath,
          fallbackPath: config.audioPath,
        },
        'NotebookLM bridge async audio start endpoint not available, falling back to legacy blocking endpoint'
      );
      payload = await postToBridge(config.audioPath, body, config);
    }

    return this.parseStartResponse(payload, getMediaDefaults('audio'));
  }

  async startVideo(
    request: NotebookLMBridgeGenerateRequest
  ): Promise<NotebookLMBridgeTaskStartResult> {
    const config = getOrCreateBridgeConfig();
    const sources = normalizeSources(request.sources);
    const body = {
      ...this.buildRequestBody(request, sources),
      video_format: request.videoFormat,
      video_style: request.videoStyle,
    };

    let payload: Record<string, unknown>;
    try {
      payload = await postToBridge(config.videoStartPath, body, config);
    } catch (error) {
      if (!shouldFallbackToLegacyStartPath(error, config.videoStartPath, config.videoPath)) {
        throw error;
      }

      logger.warn(
        {
          startPath: config.videoStartPath,
          fallbackPath: config.videoPath,
        },
        'NotebookLM bridge async video start endpoint not available, falling back to legacy blocking endpoint'
      );
      payload = await postToBridge(config.videoPath, body, config);
    }

    return this.parseStartResponse(payload, getMediaDefaults('video'));
  }

  async getTaskStatus(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeTaskStatusResult> {
    const config = getOrCreateBridgeConfig();
    const pathValue =
      mediaType === 'audio' ? config.audioTaskStatusPath : config.videoTaskStatusPath;
    const target = resolveTaskPath(pathValue, taskId);

    const payload = target.body
      ? await postToBridge(target.path, target.body, config, config.pollRequestTimeoutMs)
      : await getFromBridge(target.path, config, config.pollRequestTimeoutMs);

    return {
      taskId: extractTaskId(payload) ?? taskId,
      status: extractTaskStatus(payload),
      progress: extractTaskProgress(payload),
      responseMetadata: payload,
    };
  }

  async getTaskResult(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeTaskResult> {
    const config = getOrCreateBridgeConfig();
    const pathValue =
      mediaType === 'audio' ? config.audioTaskResultPath : config.videoTaskResultPath;
    const target = resolveTaskPath(pathValue, taskId);

    const payload = target.body
      ? await postToBridge(target.path, target.body, config, config.pollRequestTimeoutMs)
      : await getFromBridge(target.path, config, config.pollRequestTimeoutMs);

    return {
      taskId: extractTaskId(payload) ?? taskId,
      status:
        getStringValue(payload, ['status', 'task_status', 'taskStatus', 'state']) ?? undefined,
      payload,
    };
  }

  async getTaskMedia(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getOrCreateBridgeConfig();
    const defaults = getMediaDefaults(mediaType);
    const taskResult = await this.getTaskResult(taskId, mediaType);
    return this.resolveMediaFromTaskResult(taskResult, defaults, config);
  }

  async waitForTaskMedia(
    taskId: string,
    mediaType: NotebookLMBridgeMediaType,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const config = getOrCreateBridgeConfig();
    const defaults = getMediaDefaults(mediaType);
    const options = resolveWaitOptions(config, waitOptions);

    const startedAt = Date.now();
    let nextDelayMs = options.initialPollDelayMs;
    let lastStatus = 'unknown';
    const statusHistory: Record<string, unknown>[] = [];

    while (true) {
      if (Date.now() - startedAt >= options.timeoutMs) {
        throw new Error(
          `NotebookLM bridge task timed out after ${options.timeoutMs}ms (taskId=${taskId}, lastStatus=${lastStatus})`
        );
      }

      const status = await this.getTaskStatus(taskId, mediaType);
      lastStatus = status.status;
      statusHistory.push(status.responseMetadata);

      if (isFailedTaskStatus(status.status)) {
        const reason = extractTaskError(status.responseMetadata);
        throw new Error(
          reason
            ? `NotebookLM bridge task failed (taskId=${taskId}, status=${status.status}): ${reason}`
            : `NotebookLM bridge task failed (taskId=${taskId}, status=${status.status})`
        );
      }

      if (isSuccessfulTaskStatus(status.status)) {
        break;
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= options.timeoutMs) {
        throw new Error(
          `NotebookLM bridge task timed out after ${options.timeoutMs}ms (taskId=${taskId}, lastStatus=${lastStatus})`
        );
      }

      const remainingMs = options.timeoutMs - elapsedMs;
      const delayMs = Math.min(remainingMs, applyJitter(nextDelayMs, options.jitterRatio));
      await sleep(delayMs);
      nextDelayMs = Math.min(
        options.maxPollDelayMs,
        Math.max(options.initialPollDelayMs, nextDelayMs * 2)
      );
    }

    const taskResult = await this.getTaskResult(taskId, mediaType);
    const media = await this.resolveMediaFromTaskResult(taskResult, defaults, config);

    return {
      ...media,
      responseMetadata: {
        task_id: taskId,
        final_status: lastStatus,
        status_history: statusHistory,
        task_result: taskResult.payload,
      },
    };
  }

  async generateAudio(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const start = await this.startAudio(request);
    if (start.immediateMedia) {
      return start.immediateMedia;
    }

    const media = await this.waitForTaskMedia(start.taskId, 'audio', waitOptions);
    return {
      ...media,
      responseMetadata: {
        start: start.responseMetadata,
        wait: media.responseMetadata,
      },
    };
  }

  async generateVideoOverview(
    request: NotebookLMBridgeGenerateRequest,
    waitOptions?: NotebookLMBridgeWaitOptionsInput
  ): Promise<NotebookLMBridgeMediaResult> {
    const start = await this.startVideo(request);
    if (start.immediateMedia) {
      return start.immediateMedia;
    }

    const media = await this.waitForTaskMedia(start.taskId, 'video', waitOptions);
    return {
      ...media,
      responseMetadata: {
        start: start.responseMetadata,
        wait: media.responseMetadata,
      },
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
      audioEndpoint: `${config.baseUrl}${config.audioStartPath}`,
      videoEndpoint: `${config.baseUrl}${config.videoStartPath}`,
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'NotebookLM bridge endpoint summary unavailable'
    );
    return null;
  }
}
