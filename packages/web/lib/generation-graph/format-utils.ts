/**
 * Shared formatting utilities for Generation Graph components
 */

/**
 * Format duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "1.2s" or "500ms"
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return '';
  if (ms < 0) return '';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * Format large numbers with K/M suffix
 * @param num - Number to format
 * @returns Formatted string like "1.2M" or "500K"
 */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num) || num < 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format file size in bytes to human-readable string
 * @param bytes - File size in bytes
 * @returns Formatted string like "1.2 MB" or "500 KB"
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Constants
export const HEAVY_PAYLOAD_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB
export const MARKDOWN_TRUNCATE_LIMIT = 100_000; // 100KB
export const TERMINAL_MAX_LOGS = 100;
