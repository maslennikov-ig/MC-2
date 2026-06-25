import {
  PipelineTransientError,
  PipelineValidationError,
  type PipelineErrorMetadata,
} from '../../shared/errors/pipeline-errors';

export const DEFAULT_QDRANT_RECOVERY_WINDOW_MS = 3 * 60 * 60 * 1000;

const QDRANT_RECOVERY_DELAYS_MS = [
  5 * 60 * 1000,
  10 * 60 * 1000,
  20 * 60 * 1000,
  30 * 60 * 1000,
] as const;

export interface QdrantRecoveryState {
  startedAt: string;
  retryCount: number;
}

export type QdrantRecoveryDecision =
  | {
      action: 'delay';
      startedAt: string;
      retryCount: number;
      nextRetryCount: number;
      delayMs: number;
      delayUntil: string;
      elapsedMs: number;
      windowMs: number;
    }
  | {
      action: 'exhausted';
      startedAt: string;
      retryCount: number;
      elapsedMs: number;
      windowMs: number;
    };

export class QdrantUploadRetryableError extends PipelineTransientError {
  readonly code = 'QDRANT_UPLOAD_RETRYABLE';

  constructor(message: string, metadata: PipelineErrorMetadata = {}) {
    super(message, metadata);
  }
}

export class QdrantUploadNonRetryableError extends PipelineValidationError {
  readonly code = 'QDRANT_UPLOAD_NON_RETRYABLE';

  constructor(message: string, metadata: PipelineErrorMetadata = {}) {
    super(message, metadata);
  }
}

function getConfiguredRecoveryWindowMs(): number {
  const parsed = Number(process.env.QDRANT_RECOVERY_WINDOW_MS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_QDRANT_RECOVERY_WINDOW_MS;
}

function getRetryDelayMs(retryCount: number): number {
  const index = Math.max(0, Math.min(retryCount, QDRANT_RECOVERY_DELAYS_MS.length - 1));
  return QDRANT_RECOVERY_DELAYS_MS[index];
}

export function getQdrantRecoveryDecision(
  state: QdrantRecoveryState | undefined,
  nowMs: number = Date.now(),
  windowMs: number = getConfiguredRecoveryWindowMs()
): QdrantRecoveryDecision {
  const startedAt = state?.startedAt ?? new Date(nowMs).toISOString();
  const startedAtMs = Date.parse(startedAt);
  const safeStartedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : nowMs;
  const retryCount = Math.max(0, state?.retryCount ?? 0);
  const elapsedMs = Math.max(0, nowMs - safeStartedAtMs);

  if (elapsedMs >= windowMs) {
    return {
      action: 'exhausted',
      startedAt,
      retryCount,
      elapsedMs,
      windowMs,
    };
  }

  const remainingMs = windowMs - elapsedMs;
  const delayMs = Math.min(getRetryDelayMs(retryCount), remainingMs);

  if (delayMs <= 0) {
    return {
      action: 'exhausted',
      startedAt,
      retryCount,
      elapsedMs,
      windowMs,
    };
  }

  return {
    action: 'delay',
    startedAt,
    retryCount,
    nextRetryCount: retryCount + 1,
    delayMs,
    delayUntil: new Date(nowMs + delayMs).toISOString(),
    elapsedMs,
    windowMs,
  };
}

export function isQdrantUploadRetryableError(error: unknown): error is QdrantUploadRetryableError {
  return (
    error instanceof QdrantUploadRetryableError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'QDRANT_UPLOAD_RETRYABLE')
  );
}

export function isQdrantUploadNonRetryableError(
  error: unknown
): error is QdrantUploadNonRetryableError {
  return (
    error instanceof QdrantUploadNonRetryableError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'QDRANT_UPLOAD_NON_RETRYABLE')
  );
}

function getUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  const message = getUnknownErrorMessage(error);
  const match = message.match(/\b([45]\d{2})\b/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isLikelyRetryableQdrantFailure(message: string, status: number | undefined): boolean {
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  const normalized = message.toLowerCase();
  return [
    'timeout',
    'timed out',
    'fetch failed',
    'network',
    'econnrefused',
    'econnreset',
    'enotfound',
    'etimedout',
    'socket hang up',
    'service unavailable',
    'too many requests',
    'rate limit',
    'temporarily unavailable',
  ].some(pattern => normalized.includes(pattern));
}

function isLikelyNonRetryableQdrantFailure(message: string, status: number | undefined): boolean {
  if (status !== undefined && [400, 401, 403, 404].includes(status)) {
    return true;
  }

  const normalized = message.toLowerCase();
  return [
    'not found',
    'page not found',
    'missing required qdrant environment variables',
    'cannot specify both url and host',
    'bad request',
    'unauthorized',
    'forbidden',
    'invalid qdrant',
    'invalid url',
  ].some(pattern => normalized.includes(pattern));
}

export function toQdrantUploadError(
  error: unknown,
  metadata: PipelineErrorMetadata = {}
): QdrantUploadRetryableError | QdrantUploadNonRetryableError {
  if (isQdrantUploadRetryableError(error) || isQdrantUploadNonRetryableError(error)) {
    return error;
  }

  const message = getUnknownErrorMessage(error);
  const status = getErrorStatus(error);
  const enrichedMetadata = {
    ...metadata,
    status,
    originalError: message,
  };

  if (isLikelyRetryableQdrantFailure(message, status)) {
    return new QdrantUploadRetryableError(message, enrichedMetadata);
  }

  if (isLikelyNonRetryableQdrantFailure(message, status)) {
    return new QdrantUploadNonRetryableError(message, enrichedMetadata);
  }

  return new QdrantUploadRetryableError(message, enrichedMetadata);
}

export function wrapFinalQdrantUploadError(
  error: unknown,
  message: string,
  metadata: PipelineErrorMetadata = {}
): QdrantUploadRetryableError | QdrantUploadNonRetryableError {
  const classified = toQdrantUploadError(error, metadata);
  const finalMetadata = {
    ...classified.metadata,
    ...metadata,
    originalError: classified.message,
  };

  if (isQdrantUploadNonRetryableError(classified)) {
    return new QdrantUploadNonRetryableError(message, finalMetadata);
  }

  return new QdrantUploadRetryableError(message, finalMetadata);
}
