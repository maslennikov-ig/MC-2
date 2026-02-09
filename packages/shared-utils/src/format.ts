/**
 * Formatting utilities.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;
const BYTES_PER_GB = BYTES_PER_MB * 1024;

/**
 * Format milliseconds duration to human-readable string.
 *
 * @example formatDuration(500) // "500ms"
 * @example formatDuration(2500) // "2.5s"
 * @example formatDuration(90000) // "1m 30s"
 * @example formatDuration(3900000) // "1h 5m"
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return '';

  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = Math.floor(ms / MS_PER_SECOND);
  if (seconds < SECONDS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = seconds % SECONDS_PER_MINUTE;
  if (minutes < MINUTES_PER_HOUR) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainingMinutes = minutes % MINUTES_PER_HOUR;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format large numbers with K/M suffix.
 *
 * @example formatNumber(1500) // "1.5K"
 * @example formatNumber(2500000) // "2.5M"
 */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num) || num < 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format file size in bytes to human-readable string.
 *
 * @param bytes - File size in bytes (undefined/invalid returns fallback)
 * @param fallback - Value returned for undefined/invalid input (default: '0 B')
 *
 * @example formatFileSize(1536) // "1.5 KB"
 * @example formatFileSize(undefined) // "0 B"
 * @example formatFileSize(undefined, '-') // "-"
 */
export function formatFileSize(bytes: number | undefined, fallback: string = '0 B'): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return fallback;
  if (bytes === 0) return '0 B';
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  if (bytes < BYTES_PER_GB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
}
