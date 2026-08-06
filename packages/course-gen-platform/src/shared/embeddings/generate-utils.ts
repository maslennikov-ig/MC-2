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
 * Everything a Jina vector is a function of.
 *
 * A cache key built from the text alone is wrong twice over. It collides across
 * request parameters — the same text embedded with a different model, a
 * different output width or `late_chunking` toggled produces a DIFFERENT vector
 * under the same key — and, worse, it ignores that a late-chunked vector is not
 * a function of its own text at all: Jina concatenates the whole `input` array,
 * embeds it as one long context and only then splits at the chunk boundaries.
 * Move a text into a different batch and its vector changes.
 */
export interface EmbeddingCacheIdentity {
  /** Task adapter: `retrieval.passage` or `retrieval.query`. */
  task: string;
  /** Whether the vector was produced inside a late-chunking context. */
  lateChunking: boolean;
  /** Output width requested from the provider. */
  dimensions?: number;
  model?: string;
  /**
   * The ordered `input` array the vector is computed inside. REQUIRED when
   * `lateChunking` is on, because it is part of the vector's identity; ignored
   * otherwise, where each text is embedded independently and is shareable.
   */
  batchContext?: readonly string[];
}

/** Namespace prefix, overridable so a benchmark never shares production keys. */
function cacheNamespace(): string {
  return process.env.EMBEDDING_CACHE_NAMESPACE ?? 'embedding';
}

/**
 * Generates a cache key for one embedding.
 *
 * @param text - Text content to embed
 * @param identity - Every request parameter the vector depends on
 * @returns Namespaced cache key
 * @throws {Error} When late chunking is requested without its batch context
 */
export function generateCacheKey(text: string, identity: EmbeddingCacheIdentity): string {
  if (identity.lateChunking && identity.batchContext === undefined) {
    throw new Error(
      'Refusing to build a late-chunking cache key without its batch context: ' +
        'the vector depends on the whole request input, not on this text alone.'
    );
  }

  const contextHash = identity.lateChunking
    ? createHash('sha256').update(JSON.stringify(identity.batchContext)).digest('hex')
    : '';

  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        identity.model ?? 'jina-embeddings-v3',
        identity.dimensions ?? 768,
        identity.task,
        identity.lateChunking,
        contextHash,
        text,
      ])
    )
    .digest('hex');

  return `${cacheNamespace()}:${hash}`;
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
