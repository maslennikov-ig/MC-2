import axios from 'axios';

import { asObject, extensionFromMimeType } from './payload-utils.js';
import type {
  NotebookLMBridgeConfig,
  NotebookLMBridgeWaitOptions,
  NotebookLMBridgeWaitOptionsInput,
  MediaDefaults,
  NotebookLMBridgeMediaResult,
} from './types.js';

export function resolveTaskPath(
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

export function resolveWaitOptions(
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

export function applyJitter(delayMs: number, jitterRatio: number): number {
  if (delayMs <= 0 || jitterRatio <= 0) {
    return Math.max(0, Math.round(delayMs));
  }

  const jitterWindow = delayMs * jitterRatio;
  const jittered = delayMs - jitterWindow + Math.random() * jitterWindow * 2;
  return Math.max(0, Math.round(jittered));
}

export async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise(resolve => {
    setTimeout(resolve, delayMs);
  });
}

export function getBridgeRequestHeaders(config: NotebookLMBridgeConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };
}

export async function postToBridge(
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

export async function getFromBridge(
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

export function shouldFallbackToLegacyStartPath(
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

export async function downloadFromUrl(
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
