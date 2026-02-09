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
