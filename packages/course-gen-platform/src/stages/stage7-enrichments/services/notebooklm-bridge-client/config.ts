import { logger } from '../../../../shared/logger/index.js';
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_POLL_REQUEST_TIMEOUT_MS,
  DEFAULT_POLL_INITIAL_DELAY_MS,
  DEFAULT_POLL_MAX_DELAY_MS,
  DEFAULT_POLL_JITTER_RATIO,
  AUDIO_DEFAULT_PATH,
  VIDEO_DEFAULT_PATH,
  AUDIO_START_DEFAULT_PATH,
  VIDEO_START_DEFAULT_PATH,
  AUDIO_TASK_STATUS_DEFAULT_PATH,
  VIDEO_TASK_STATUS_DEFAULT_PATH,
  AUDIO_TASK_RESULT_DEFAULT_PATH,
  VIDEO_TASK_RESULT_DEFAULT_PATH,
  STUDY_GUIDE_START_DEFAULT_PATH,
  STUDY_GUIDE_TASK_STATUS_DEFAULT_PATH,
  STUDY_GUIDE_TASK_RESULT_DEFAULT_PATH,
  FLASHCARDS_START_DEFAULT_PATH,
  FLASHCARDS_TASK_STATUS_DEFAULT_PATH,
  FLASHCARDS_TASK_RESULT_DEFAULT_PATH,
  MIND_MAP_START_DEFAULT_PATH,
  MIND_MAP_TASK_STATUS_DEFAULT_PATH,
  MIND_MAP_TASK_RESULT_DEFAULT_PATH,
  INFOGRAPHIC_START_DEFAULT_PATH,
  INFOGRAPHIC_TASK_STATUS_DEFAULT_PATH,
  INFOGRAPHIC_TASK_RESULT_DEFAULT_PATH,
} from './constants.js';

import type { NotebookLMBridgeConfig } from './types.js';

export function normalizePath(pathValue: string, fallback: string): string {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function parsePositiveNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

export function parseNonNegativeNumber(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
}

export function parseJitterRatio(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }

  return fallback;
}

export function getBridgeConfig(): NotebookLMBridgeConfig {
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
    studyGuideStartPath: normalizePath('', STUDY_GUIDE_START_DEFAULT_PATH),
    studyGuideTaskStatusPath: normalizePath('', STUDY_GUIDE_TASK_STATUS_DEFAULT_PATH),
    studyGuideTaskResultPath: normalizePath('', STUDY_GUIDE_TASK_RESULT_DEFAULT_PATH),
    flashcardsStartPath: normalizePath('', FLASHCARDS_START_DEFAULT_PATH),
    flashcardsTaskStatusPath: normalizePath('', FLASHCARDS_TASK_STATUS_DEFAULT_PATH),
    flashcardsTaskResultPath: normalizePath('', FLASHCARDS_TASK_RESULT_DEFAULT_PATH),
    mindMapStartPath: normalizePath('', MIND_MAP_START_DEFAULT_PATH),
    mindMapTaskStatusPath: normalizePath('', MIND_MAP_TASK_STATUS_DEFAULT_PATH),
    mindMapTaskResultPath: normalizePath('', MIND_MAP_TASK_RESULT_DEFAULT_PATH),
    infographicStartPath: normalizePath('', INFOGRAPHIC_START_DEFAULT_PATH),
    infographicTaskStatusPath: normalizePath('', INFOGRAPHIC_TASK_STATUS_DEFAULT_PATH),
    infographicTaskResultPath: normalizePath('', INFOGRAPHIC_TASK_RESULT_DEFAULT_PATH),
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

export let cachedBridgeConfig: NotebookLMBridgeConfig | null = null;

export function getOrCreateBridgeConfig(): NotebookLMBridgeConfig {
  if (!cachedBridgeConfig) {
    cachedBridgeConfig = getBridgeConfig();
  }
  return cachedBridgeConfig;
}

export function isNotebookLMBridgeConfigured(): boolean {
  return Boolean(
    (process.env.NOTEBOOKLM_BRIDGE_URL || process.env.NOTEBOOKLM_BRIDGE_BASE_URL) &&
      (process.env.NOTEBOOKLM_BRIDGE_TOKEN || process.env.NOTEBOOKLM_TOKEN)
  );
}

export function getNotebookLMBridgeEndpointSummary(): {
  audioEndpoint: string;
  videoEndpoint: string;
  studyGuideEndpoint: string;
  flashcardsEndpoint: string;
  mindMapEndpoint: string;
  infographicEndpoint: string;
} | null {
  if (!isNotebookLMBridgeConfigured()) {
    return null;
  }

  try {
    const config = getBridgeConfig();
    return {
      audioEndpoint: `${config.baseUrl}${config.audioStartPath}`,
      videoEndpoint: `${config.baseUrl}${config.videoStartPath}`,
      studyGuideEndpoint: `${config.baseUrl}${config.studyGuideStartPath}`,
      flashcardsEndpoint: `${config.baseUrl}${config.flashcardsStartPath}`,
      mindMapEndpoint: `${config.baseUrl}${config.mindMapStartPath}`,
      infographicEndpoint: `${config.baseUrl}${config.infographicStartPath}`,
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'NotebookLM bridge endpoint summary unavailable'
    );
    return null;
  }
}
