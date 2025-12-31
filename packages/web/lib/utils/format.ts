/**
 * Formatting Utilities
 * @module lib/utils/format
 *
 * Common formatting functions used across the application.
 */

/**
 * Format milliseconds duration to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1m 30s", "2.5s", "500ms")
 * @example
 * formatDuration(1500) // "1.5s"
 * formatDuration(65000) // "1m 5s"
 * formatDuration(500) // "500ms"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
