/**
 * Utility functions for embedding generation
 * @module shared/embeddings/generate-utils
 *
 * Extracted utility functions to reduce generate.ts complexity
 */

import { createHash } from 'crypto';

/**
 * Jina-v3 API request with late chunking support
 */
export interface JinaV3Request {
  /** Model identifier */
  model: 'jina-embeddings-v3';
  /** Text input(s) - array for late chunking */
  input: string[];
  /** Task type for task-specific adapters */
  task: 'retrieval.passage' | 'retrieval.query';
  /** Embedding dimensions (default: 1024, we use 768) */
  dimensions?: number;
  /** Enable late chunking (default: false) */
  late_chunking?: boolean;
}

/**
 * Jina-v3 API response
 */
export interface JinaV3Response {
  /** Array of embedding data */
  data: Array<{
    /** Embedding vector */
    embedding: number[];
    /** Text index in input array */
    index: number;
  }>;
  /** Token usage statistics */
  usage: {
    /** Total tokens processed */
    total_tokens: number;
    /** Prompt tokens (for late chunking) */
    prompt_tokens?: number;
  };
}

/**
 * Generates a cache key for embedding
 *
 * @param text - Text content to embed
 * @param task - Task type (retrieval.passage or retrieval.query)
 * @returns Cache key with embedding namespace
 */
export function generateCacheKey(text: string, task: string): string {
  const hash = createHash('sha256').update(`${text}:${task}`).digest('hex');
  return `embedding:${hash}`;
}

/**
 * Sleep utility for retry delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Cache TTL for embeddings (1 hour = 3600 seconds)
 */
export const EMBEDDING_CACHE_TTL = 3600;

/**
 * Jina API maximum tokens per batch (8194 tokens total)
 * Apply 95% safety margin to avoid edge cases
 */
export const JINA_MAX_TOKENS = 8194;
export const SAFETY_MARGIN = 0.95;
export const EFFECTIVE_TOKEN_LIMIT = Math.floor(JINA_MAX_TOKENS * SAFETY_MARGIN);

/**
 * Fetch timeout in milliseconds (30 seconds)
 */
export const FETCH_TIMEOUT_MS = 30000;

/**
 * Maximum retry attempts for transient errors
 */
export const MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff (1 second)
 */
export const BASE_RETRY_DELAY_MS = 1000;
