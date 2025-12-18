/**
 * Jina-embeddings-v3 API Client
 *
 * This module provides a client for generating text embeddings using the Jina-embeddings-v3 API.
 * It includes rate limiting (1500 RPM), exponential backoff for retries, and comprehensive error handling.
 *
 * Features:
 * - 768-dimensional embeddings (matches Qdrant collection configuration)
 * - Task-specific embeddings: "retrieval.passage" (for indexing) and "retrieval.query" (for search)
 * - Rate limiting: 1500 requests per minute (40ms minimum between requests)
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s (max 3 retries)
 * - Batch support: Up to 100 texts per request
 * - Russian language optimization
 * - Token usage tracking for cost monitoring
 *
 * @module shared/embeddings/jina-client
 * @see https://jina.ai/embeddings/
 */

import logger from '../logger';

/**
 * Jina API request payload
 */
interface JinaEmbeddingRequest {
  /** Model identifier (always "jina-embeddings-v3") */
  model: 'jina-embeddings-v3';
  /** Text input(s) to embed - single string or array of strings */
  input: string | string[];
  /** Task type for task-specific embeddings */
  task: 'retrieval.passage' | 'retrieval.query';
  /** Number of dimensions (768 for our Qdrant collection) */
  dimensions: 768;
  /** Whether to normalize embeddings (false for Qdrant with Cosine similarity) */
  normalized: boolean;
  /** Whether to truncate long texts (true to handle texts >8192 tokens) */
  truncate: boolean;
}

/**
 * Jina API response structure
 */
interface JinaEmbeddingResponse {
  /** Array of embedding data objects */
  data: Array<{
    /** 768-dimensional embedding vector */
    embedding: number[];
  }>;
  /** Token usage statistics */
  usage: {
    /** Total tokens processed */
    total_tokens: number;
  };
}

/**
 * Jina API error response structure
 */
interface JinaErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  detail?: string;
  message?: string;
}

/**
 * Custom error class for Jina API failures
 */
export class JinaEmbeddingError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorType?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'JinaEmbeddingError';
    Object.setPrototypeOf(this, JinaEmbeddingError.prototype);
  }
}

/**
 * Validates that the Jina API key is configured
 *
 * @throws {JinaEmbeddingError} If JINA_API_KEY is not set
 */
function validateJinaConfig(): void {
  if (!process.env.JINA_API_KEY) {
    throw new JinaEmbeddingError(
      'Missing required environment variable: JINA_API_KEY. ' +
        'Please ensure it is set in your .env file.',
      undefined,
      'CONFIG_ERROR'
    );
  }
}

/**
 * Rate limiter to enforce 1500 RPM (40ms minimum between requests)
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 40; // milliseconds (1500 RPM = 1 request per 40ms)

  /**
   * Waits until the rate limit allows the next request
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

/**
 * Singleton rate limiter instance
 */
const rateLimiter = new RateLimiter();

/**
 * Token usage tracker for monitoring Jina API costs
 */
class TokenUsageTracker {
  private totalTokens = 0;
  private requestCount = 0;
  private sessionStart = Date.now();

  track(tokens: number): void {
    this.totalTokens += tokens;
    this.requestCount++;
  }

  getStats(): { totalTokens: number; requestCount: number; sessionDurationMs: number } {
    return {
      totalTokens: this.totalTokens,
      requestCount: this.requestCount,
      sessionDurationMs: Date.now() - this.sessionStart,
    };
  }

  reset(): void {
    this.totalTokens = 0;
    this.requestCount = 0;
    this.sessionStart = Date.now();
  }
}

/**
 * Singleton token tracker - use getJinaTokenStats() to retrieve
 */
const tokenTracker = new TokenUsageTracker();

/**
 * Get current session token usage statistics
 */
export function getJinaTokenStats(): { totalTokens: number; requestCount: number; sessionDurationMs: number } {
  return tokenTracker.getStats();
}

/**
 * Reset token usage statistics (for new session)
 */
export function resetJinaTokenStats(): void {
  tokenTracker.reset();
}

/**
 * Implements exponential backoff retry logic
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Result of the function
 * @throws {JinaEmbeddingError} If all retries are exhausted
 */
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (error instanceof JinaEmbeddingError) {
        // Don't retry on client errors (4xx except 429)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
          throw error;
        }
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate backoff delay: 1s, 2s, 4s, 8s, 16s, 32s (max)
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 32000);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Makes a request to the Jina embeddings API
 *
 * @param payload - Request payload
 * @returns Embedding response
 * @throws {JinaEmbeddingError} On API errors
 */
async function makeJinaRequest(
  payload: JinaEmbeddingRequest
): Promise<JinaEmbeddingResponse> {
  validateJinaConfig();

  // Wait for rate limit slot
  await rateLimiter.waitForSlot();

  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000), // 60s timeout to prevent indefinite hangs
  });

  if (!response.ok) {
    let errorMessage = `Jina API request failed with status ${response.status}`;
    let errorType = 'API_ERROR';

    try {
      const errorData = (await response.json()) as JinaErrorResponse;
      errorMessage = errorData.error?.message || errorData.detail || errorData.message || errorMessage;
      errorType = errorData.error?.type || errorType;
    } catch {
      // If error response is not JSON, use the status text
      errorMessage = response.statusText || errorMessage;
    }

    throw new JinaEmbeddingError(errorMessage, response.status, errorType);
  }

  const data = (await response.json()) as JinaEmbeddingResponse;

  // Validate response structure
  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new JinaEmbeddingError(
      'Invalid response from Jina API: missing or empty data array',
      undefined,
      'INVALID_RESPONSE'
    );
  }

  // Track token usage
  const tokensUsed = data.usage?.total_tokens || 0;
  tokenTracker.track(tokensUsed);

  const stats = tokenTracker.getStats();
  logger.info({
    tokensUsed,
    totalTokensSession: stats.totalTokens,
    requestCount: stats.requestCount,
    embeddingsGenerated: data.data.length,
    task: payload.task,
  }, '[Jina] Embedding request completed');

  return data;
}

/**
 * Generates a single text embedding using Jina-embeddings-v3
 *
 * @param text - Text to embed (supports up to 8192 tokens, auto-truncated if longer)
 * @param task - Task type: "retrieval.passage" for indexing documents, "retrieval.query" for search queries
 * @returns 768-dimensional embedding vector
 * @throws {JinaEmbeddingError} If the API request fails or configuration is invalid
 *
 * @example
 * ```typescript
 * import { generateEmbedding } from '@/shared/embeddings/jina-client';
 *
 * // Generate embedding for a document to index
 * const documentEmbedding = await generateEmbedding(
 *   "Machine learning is a subset of artificial intelligence...",
 *   "retrieval.passage"
 * );
 *
 * // Generate embedding for a search query
 * const queryEmbedding = await generateEmbedding(
 *   "What is machine learning?",
 *   "retrieval.query"
 * );
 *
 * // Store in Qdrant
 * await qdrantClient.upsert('knowledge-base', {
 *   points: [
 *     {
 *       id: 1,
 *       vector: documentEmbedding,
 *       payload: { text: "Machine learning is..." }
 *     }
 *   ]
 * });
 * ```
 */
export async function generateEmbedding(
  text: string,
  task: 'retrieval.passage' | 'retrieval.query'
): Promise<number[]> {
  const embedding = await retryWithExponentialBackoff(async () => {
    const response = await makeJinaRequest({
      model: 'jina-embeddings-v3',
      input: text,
      task,
      dimensions: 768,
      normalized: false, // Qdrant handles normalization for Cosine similarity
      truncate: true,    // Auto-truncate texts >8192 tokens
    });

    return response.data[0].embedding;
  });

  // Validate embedding dimensions
  if (embedding.length !== 768) {
    throw new JinaEmbeddingError(
      `Invalid embedding dimensions: expected 768, got ${embedding.length}`,
      undefined,
      'DIMENSION_MISMATCH'
    );
  }

  return embedding;
}

/**
 * Generates embeddings for multiple texts in batch
 *
 * This function handles batching internally, processing up to 100 texts per API request
 * for optimal performance. Larger batches are automatically split into multiple requests.
 *
 * @param texts - Array of texts to embed (supports up to 8192 tokens per text)
 * @param task - Task type: "retrieval.passage" for indexing, "retrieval.query" for search
 * @returns Array of 768-dimensional embedding vectors (same order as input texts)
 * @throws {JinaEmbeddingError} If any API request fails or configuration is invalid
 *
 * @example
 * ```typescript
 * import { generateEmbeddings } from '@/shared/embeddings/jina-client';
 *
 * // Generate embeddings for multiple document chunks
 * const texts = [
 *   "First paragraph of the document...",
 *   "Second paragraph of the document...",
 *   "Third paragraph of the document..."
 * ];
 *
 * const embeddings = await generateEmbeddings(texts, "retrieval.passage");
 *
 * // Batch upsert to Qdrant
 * const points = texts.map((text, index) => ({
 *   id: index + 1,
 *   vector: embeddings[index],
 *   payload: { text }
 * }));
 *
 * await qdrantClient.upsert('knowledge-base', { points });
 * ```
 *
 * @example
 * ```typescript
 * // Handle large batches (auto-splits into multiple API requests)
 * const largeTextArray = [...]; // 500 texts
 * const embeddings = await generateEmbeddings(largeTextArray, "retrieval.passage");
 * // This will make 5 API requests (100 texts each), respecting rate limits
 * ```
 */
export async function generateEmbeddings(
  texts: string[],
  task: 'retrieval.passage' | 'retrieval.query'
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Jina API supports up to 100 texts per request for optimal performance
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const batchEmbeddings = await retryWithExponentialBackoff(async () => {
      const response = await makeJinaRequest({
        model: 'jina-embeddings-v3',
        input: batch,
        task,
        dimensions: 768,
        normalized: false,
        truncate: true,
      });

      return response.data.map((item) => item.embedding);
    });

    // Validate batch embeddings
    for (const embedding of batchEmbeddings) {
      if (embedding.length !== 768) {
        throw new JinaEmbeddingError(
          `Invalid embedding dimensions: expected 768, got ${embedding.length}`,
          undefined,
          'DIMENSION_MISMATCH'
        );
      }
    }

    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Health check for Jina API connectivity
 *
 * Generates a test embedding to verify API configuration and connectivity.
 * Useful for startup checks and debugging.
 *
 * @returns True if the API is accessible and configured correctly
 * @throws {JinaEmbeddingError} If the health check fails
 *
 * @example
 * ```typescript
 * import { healthCheck } from '@/shared/embeddings/jina-client';
 *
 * // Verify Jina API configuration on startup
 * try {
 *   await healthCheck();
 *   console.log('Jina API is ready');
 * } catch (error) {
 *   console.error('Jina API health check failed:', error);
 *   process.exit(1);
 * }
 * ```
 */
export async function healthCheck(): Promise<boolean> {
  try {
    validateJinaConfig();
    const testEmbedding = await generateEmbedding('test', 'retrieval.query');
    return testEmbedding.length === 768;
  } catch (error) {
    if (error instanceof JinaEmbeddingError) {
      throw error;
    }
    throw new JinaEmbeddingError(
      'Jina API health check failed',
      undefined,
      'HEALTH_CHECK_FAILED',
      error
    );
  }
}

/**
 * Export types for external use
 */
export type {
  JinaEmbeddingRequest,
  JinaEmbeddingResponse,
  JinaErrorResponse,
};
