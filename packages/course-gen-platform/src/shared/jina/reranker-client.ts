/**
 * Jina Reranker v2 API Client
 *
 * This module provides a client for reranking documents using the Jina Reranker v2 Base Multilingual API.
 * It includes rate limiting (1500 RPM), exponential backoff for retries, and comprehensive error handling.
 *
 * Features:
 * - Multilingual support: Optimized for cross-lingual search and retrieval
 * - Relevance scoring: Returns 0-1 relevance scores for query-document pairs
 * - Rate limiting: 1500 requests per minute (40ms minimum between requests)
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s (max 3 retries)
 * - Top-N selection: Returns only the most relevant documents
 * - Token usage tracking: Monitors API consumption for cost analysis
 *
 * @module shared/jina/reranker-client
 * @see https://jina.ai/reranker/
 */

import { createHash } from 'crypto';
import logger from '../logger';
import { cache } from '../cache/redis';

/**
 * Jina Reranker API request payload
 */
interface JinaRerankerRequest {
  /** Model identifier (always "jina-reranker-v2-base-multilingual") */
  model: 'jina-reranker-v2-base-multilingual';
  /** Query text to compare against documents */
  query: string;
  /** Array of document texts to rerank */
  documents: string[];
  /** Optional: Number of top results to return (default: all documents) */
  top_n?: number;
}

/**
 * Jina Reranker API response structure
 */
interface JinaRerankerResponse {
  /** Array of reranked results with scores */
  results: Array<{
    /** Original index of the document in the input array */
    index: number;
    /** Relevance score (0-1, higher is more relevant) */
    relevance_score: number;
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
 * Rerank result for a single document
 */
export interface RerankResult {
  /** Original index of the document in the input array */
  index: number;
  /** Relevance score (0-1, higher is more relevant) */
  relevance_score: number;
}

/**
 * Custom error class for Jina Reranker API failures
 */
export class JinaRerankerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorType?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'JinaRerankerError';
    Object.setPrototypeOf(this, JinaRerankerError.prototype);
  }
}

/**
 * Validates that the Jina API key is configured
 *
 * @throws {JinaRerankerError} If JINA_API_KEY is not set
 */
function validateJinaConfig(): void {
  if (!process.env.JINA_API_KEY) {
    throw new JinaRerankerError(
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
 * Token usage tracker for monitoring Jina Reranker API costs
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
 * Singleton token tracker - use getRerankerTokenStats() to retrieve
 */
const tokenTracker = new TokenUsageTracker();

/**
 * Get current session token usage statistics for reranker
 */
export function getRerankerTokenStats(): { totalTokens: number; requestCount: number; sessionDurationMs: number } {
  return tokenTracker.getStats();
}

/**
 * Reset reranker token usage statistics (for new session)
 */
export function resetRerankerTokenStats(): void {
  tokenTracker.reset();
}

/**
 * Cache TTL for reranker results (1 hour = 3600 seconds)
 * Same as embedding cache for consistency
 */
const RERANKER_CACHE_TTL = 3600;

/**
 * Generates a cache key for reranker results
 *
 * @param query - Query text
 * @param documents - Array of document texts
 * @param topN - Number of top results requested
 * @returns Cache key with reranker namespace
 */
function generateRerankCacheKey(query: string, documents: string[], topN?: number): string {
  // Create a deterministic hash of the query and all documents
  const contentHash = createHash('sha256')
    .update(`${query}:${topN || 'all'}:${documents.join('|')}`)
    .digest('hex');
  return `rerank:${contentHash}`;
}

/**
 * Implements exponential backoff retry logic
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Result of the function
 * @throws {JinaRerankerError} If all retries are exhausted
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
      if (error instanceof JinaRerankerError) {
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
 * Makes a request to the Jina Reranker API
 *
 * @param payload - Request payload
 * @returns Reranker response
 * @throws {JinaRerankerError} On API errors
 */
async function makeJinaRequest(
  payload: JinaRerankerRequest
): Promise<JinaRerankerResponse> {
  validateJinaConfig();

  // Wait for rate limit slot
  await rateLimiter.waitForSlot();

  const response = await fetch('https://api.jina.ai/v1/rerank', {
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
    let errorMessage = `Jina Reranker API request failed with status ${response.status}`;
    let errorType = 'API_ERROR';

    try {
      const errorData = (await response.json()) as JinaErrorResponse;
      errorMessage = errorData.error?.message || errorData.detail || errorData.message || errorMessage;
      errorType = errorData.error?.type || errorType;
    } catch {
      // If error response is not JSON, use the status text
      errorMessage = response.statusText || errorMessage;
    }

    throw new JinaRerankerError(errorMessage, response.status, errorType);
  }

  const data = (await response.json()) as JinaRerankerResponse;

  // Validate response structure
  if (!data.results || !Array.isArray(data.results)) {
    throw new JinaRerankerError(
      'Invalid response from Jina Reranker API: missing or invalid results array',
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
    documentsReranked: payload.documents.length,
    queryLength: payload.query.length,
    topN: payload.top_n,
  }, '[Jina Reranker] Request completed');

  return data;
}

/**
 * Reranks documents based on their relevance to a query
 *
 * This function uses the Jina Reranker v2 API to score documents by relevance to a query.
 * Documents are returned sorted by relevance score (highest first).
 *
 * @param query - Query text to compare against documents
 * @param documents - Array of document texts to rerank
 * @param topN - Optional: Number of top results to return (default: all documents)
 * @returns Array of rerank results with original indices and relevance scores, sorted by score (descending)
 * @throws {JinaRerankerError} If the API request fails, configuration is invalid, or input is invalid
 *
 * @example
 * ```typescript
 * import { rerankDocuments } from '@/shared/jina/reranker-client';
 *
 * // Rerank search results by query relevance
 * const query = "What is machine learning?";
 * const documents = [
 *   "Machine learning is a subset of artificial intelligence...",
 *   "Deep learning uses neural networks...",
 *   "Python is a programming language..."
 * ];
 *
 * const results = await rerankDocuments(query, documents, 2);
 * // Results: [
 * //   { index: 0, relevance_score: 0.95 },
 * //   { index: 1, relevance_score: 0.72 }
 * // ]
 *
 * // Get the top document
 * const topDoc = documents[results[0].index];
 * ```
 *
 * @example
 * ```typescript
 * // Rerank RAG search results
 * const ragResults = await searchQdrant({ query: "machine learning", limit: 10 });
 * const documents = ragResults.map(r => r.content);
 *
 * // Rerank to get top 3 most relevant
 * const reranked = await rerankDocuments(query, documents, 3);
 *
 * // Use top results for context
 * const topContexts = reranked.map(r => documents[r.index]);
 * ```
 *
 * @example
 * ```typescript
 * // Handle edge cases
 * try {
 *   // Empty documents array
 *   const empty = await rerankDocuments("query", []);
 *   console.log(empty); // []
 *
 *   // Single document
 *   const single = await rerankDocuments("query", ["doc"]);
 *   console.log(single); // [{ index: 0, relevance_score: 0.X }]
 * } catch (error) {
 *   if (error instanceof JinaRerankerError) {
 *     console.error('Reranking failed:', error.message);
 *   }
 * }
 * ```
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  topN?: number
): Promise<RerankResult[]> {
  // Handle edge cases
  if (!query || query.trim().length === 0) {
    throw new JinaRerankerError(
      'Query cannot be empty',
      undefined,
      'INVALID_INPUT'
    );
  }

  if (documents.length === 0) {
    return [];
  }

  // Validate documents
  const validDocuments = documents.filter(doc => doc && doc.trim().length > 0);
  if (validDocuments.length === 0) {
    throw new JinaRerankerError(
      'All documents are empty',
      undefined,
      'INVALID_INPUT'
    );
  }

  if (validDocuments.length !== documents.length) {
    throw new JinaRerankerError(
      `${documents.length - validDocuments.length} empty documents found. All documents must be non-empty.`,
      undefined,
      'INVALID_INPUT'
    );
  }

  // Generate cache key
  const cacheKey = generateRerankCacheKey(query, documents, topN);

  // Check cache first
  try {
    const cached = await cache.get<RerankResult[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      logger.debug({
        cacheKey: cacheKey.substring(0, 40) + '...',
        cachedResultsCount: cached.length,
        documentsCount: documents.length,
      }, '[Jina Reranker] Cache hit');
      return cached;
    }
  } catch (error) {
    // Cache error - fall back to API call
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      documentsCount: documents.length,
    }, '[Jina Reranker] Cache read error, falling back to API');
  }

  // Cache miss - call API
  logger.debug({
    cacheKey: cacheKey.substring(0, 40) + '...',
    documentsCount: documents.length,
    queryLength: query.length,
  }, '[Jina Reranker] Cache miss, calling API');

  const results = await retryWithExponentialBackoff(async () => {
    const response = await makeJinaRequest({
      model: 'jina-reranker-v2-base-multilingual',
      query: query.trim(),
      documents,
      top_n: topN,
    });

    return response.results;
  });

  // Cache the results
  try {
    const cacheResult = await cache.set(cacheKey, results, { ttl: RERANKER_CACHE_TTL });
    if (cacheResult) {
      logger.debug({
        cacheKey: cacheKey.substring(0, 40) + '...',
        resultsCount: results.length,
        ttl: RERANKER_CACHE_TTL,
      }, '[Jina Reranker] Results cached successfully');
    }
  } catch (error) {
    // Log cache write error but continue
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      resultsCount: results.length,
    }, '[Jina Reranker] Cache write error, continuing without caching');
  }

  // Results are already sorted by relevance_score (descending) from the API
  return results;
}

/**
 * Health check for Jina Reranker API connectivity
 *
 * Performs a test reranking request to verify API configuration and connectivity.
 * Useful for startup checks and debugging.
 *
 * @returns True if the API is accessible and configured correctly
 * @throws {JinaRerankerError} If the health check fails
 *
 * @example
 * ```typescript
 * import { healthCheck } from '@/shared/jina/reranker-client';
 *
 * // Verify Jina Reranker API configuration on startup
 * try {
 *   await healthCheck();
 *   console.log('Jina Reranker API is ready');
 * } catch (error) {
 *   console.error('Jina Reranker API health check failed:', error);
 *   process.exit(1);
 * }
 * ```
 */
export async function healthCheck(): Promise<boolean> {
  try {
    validateJinaConfig();
    const testResults = await rerankDocuments(
      'test query',
      ['test document 1', 'test document 2']
    );
    return testResults.length === 2;
  } catch (error) {
    if (error instanceof JinaRerankerError) {
      throw error;
    }
    throw new JinaRerankerError(
      'Jina Reranker API health check failed',
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
  JinaRerankerRequest,
  JinaRerankerResponse,
  JinaErrorResponse,
};
