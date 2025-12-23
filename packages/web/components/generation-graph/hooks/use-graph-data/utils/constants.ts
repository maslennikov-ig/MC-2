/**
 * Configuration limits for graph data processing.
 * Prevents unbounded memory growth from trace processing.
 */
export const GRAPH_DATA_LIMITS = {
  /** Maximum number of processed trace IDs to track before cleanup */
  MAX_PROCESSED_TRACES: 1000,
  /** Number of recent trace IDs to retain during cleanup */
  CLEANUP_RETAIN_COUNT: 500,
} as const;
