/**
 * Formatting utilities.
 */

/**
 * Format milliseconds duration to human-readable string.
 *
 * - < 1s: "500ms"
 * - < 60s: "2.5s"
 * - < 60m: "1m 30s"
 * - >= 60m: "1h 5m"
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return '';

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format large numbers with K/M suffix.
 *
 * - < 1K: "999"
 * - < 1M: "1.2K"
 * - >= 1M: "1.2M"
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
 * - < 1 KB: "512 B"
 * - < 1 MB: "1.2 KB"
 * - < 1 GB: "1.2 MB"
 * - >= 1 GB: "1.2 GB"
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
