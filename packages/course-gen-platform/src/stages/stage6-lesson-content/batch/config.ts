const DEFAULT_BATCH_MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_BATCH_POLL_INTERVAL_MS = 60 * 1000;
const MIN_BATCH_MAX_WAIT_MS = 5 * 60 * 1000;
const MAX_BATCH_MAX_WAIT_MS = 24 * 60 * 60 * 1000;

function boundedMilliseconds(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

/** Explicit opt-in. Missing and every value except `true` keep the old path. */
export function isStage6BatchEnabled(): boolean {
  return process.env.FEATURE_STAGE6_BATCH_GENERATION === 'true';
}

export function getStage6BatchMaxWaitMs(): number {
  return boundedMilliseconds(
    process.env.STAGE6_BATCH_MAX_WAIT_MS,
    DEFAULT_BATCH_MAX_WAIT_MS,
    MIN_BATCH_MAX_WAIT_MS,
    MAX_BATCH_MAX_WAIT_MS
  );
}

export function getStage6BatchPollIntervalMs(): number {
  return boundedMilliseconds(
    process.env.STAGE6_BATCH_POLL_INTERVAL_MS,
    DEFAULT_BATCH_POLL_INTERVAL_MS,
    5_000,
    5 * 60 * 1000
  );
}
