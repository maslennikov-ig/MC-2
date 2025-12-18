/**
 * Embedding Generation with Late Chunking
 *
 * Implements Jina-v3 embedding generation with late chunking enabled for T075.
 * Late chunking provides context-aware embeddings across chunk boundaries,
 * improving retrieval performance by 35-49% according to Jina AI research.
 *
 * Features:
 * - Late chunking enabled by default (late_chunking=true)
 * - Task-specific adapters (retrieval.passage, retrieval.query)
 * - Batch processing for efficiency (100 texts per request)
 * - 768-dimensional embeddings (matches Qdrant collection)
 * - Zero additional cost for late chunking
 * - Redis caching with 1-hour TTL (T076 requirement)
 *
 * @module shared/embeddings/generate
 * @see https://jina.ai/news/late-chunking-in-long-context-embedding-models/
 */

import { createHash } from 'crypto';
import type { EnrichedChunk } from './metadata-enricher';
import { cache } from '../cache/redis';
import logger from '../logger';

/**
 * Jina-v3 API request with late chunking support
 */
interface JinaV3Request {
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
interface JinaV3Response {
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
 * Jina API error response structure
 */
interface JinaAPIErrorData {
  error?: {
    message?: string;
    detail?: string;
  };
  detail?: string;
  message?: string;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  /** Chunk with embedding */
  chunk: EnrichedChunk;
  /** 768-dimensional dense embedding */
  dense_vector: number[];
  /** Token count for this embedding */
  token_count: number;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Embeddings for all chunks */
  embeddings: EmbeddingResult[];
  /** Total tokens processed */
  total_tokens: number;
  /** Processing metadata */
  metadata: {
    chunk_count: number;
    batch_count: number;
    late_chunking_enabled: boolean;
  };
}

/**
 * Cache TTL for embeddings (1 hour = 3600 seconds)
 */
const EMBEDDING_CACHE_TTL = 3600;

/**
 * Generates a cache key for embedding
 *
 * @param text - Text content to embed
 * @param task - Task type (retrieval.passage or retrieval.query)
 * @returns Cache key with embedding namespace
 */
function generateCacheKey(text: string, task: string): string {
  const hash = createHash('sha256')
    .update(`${text}:${task}`)
    .digest('hex');
  return `embedding:${hash}`;
}

/**
 * Validates Jina API configuration
 */
function validateJinaConfig(): void {
  if (!process.env.JINA_API_KEY) {
    throw new Error(
      'Missing required environment variable: JINA_API_KEY. ' +
        'Please ensure it is set in your .env file.'
    );
  }
}

/**
 * Rate limiter for Jina API (1500 RPM = 40ms between requests)
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 40; // milliseconds

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter();

/**
 * Fetch timeout in milliseconds (30 seconds)
 */
const FETCH_TIMEOUT_MS = 30000;

/**
 * Maximum retry attempts for transient errors
 */
const MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff (1 second)
 */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks if an error is retryable (network issues, timeouts, server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors, timeouts, aborts
    if (
      message.includes('terminated') ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Makes a request to Jina-v3 API with late chunking
 * Includes retry logic for transient errors and fetch timeout
 *
 * @param payload - Request payload
 * @returns Embedding response
 */
async function makeJinaV3Request(payload: JinaV3Request): Promise<JinaV3Response> {
  validateJinaConfig();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await rateLimiter.waitForSlot();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `Jina API request failed with status ${response.status}`;

          try {
            const errorData = (await response.json()) as JinaAPIErrorData;
            // Safely extract error message from various possible error structures
            errorMessage =
              errorData.error?.message ||
              errorData.error?.detail ||
              errorData.detail ||
              errorData.message ||
              errorMessage;
          } catch {
            // JSON parsing failed, fall back to status text
            errorMessage = response.statusText || errorMessage;
          }

          // Retry on 5xx server errors
          if (response.status >= 500 && attempt < MAX_RETRIES) {
            logger.warn({
              status: response.status,
              attempt,
              maxRetries: MAX_RETRIES,
            }, 'Jina API server error, retrying...');
            lastError = new Error(`Jina API Error: ${errorMessage}`);
            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }

          logger.error({
            status: response.status,
            err: errorMessage,
          }, 'Jina API request failed');

          throw new Error(`Jina API Error: ${errorMessage}`);
        }

        const data = (await response.json()) as JinaV3Response;

        // Validate response
        if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
          throw new Error('Invalid response from Jina API: missing or empty data array');
        }

        return data;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn({
          err: lastError.message,
          attempt,
          maxRetries: MAX_RETRIES,
          nextRetryIn: delay,
        }, 'Jina API transient error, retrying...');
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries reached
      throw lastError;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error('Jina API request failed after all retries');
}

/**
 * Generates embeddings for chunks with late chunking enabled
 *
 * Late chunking works by:
 * 1. Concatenating all chunk texts into a single long string
 * 2. Embedding the full concatenated text (leveraging long-context model)
 * 3. Splitting embeddings at chunk boundaries (late chunking)
 * 4. Returning context-aware embeddings for each chunk
 *
 * This provides better retrieval performance than embedding chunks independently.
 *
 * @param chunks - Array of enriched chunks to embed
 * @param task - Task type ("retrieval.passage" for indexing, "retrieval.query" for search)
 * @param late_chunking - Enable late chunking (default: true)
 * @returns Batch embedding result with dense vectors
 *
 * @example
 * ```typescript
 * import { generateEmbeddingsWithLateChunking } from './generate';
 *
 * // Generate embeddings for child chunks (indexed in Qdrant)
 * const result = await generateEmbeddingsWithLateChunking(
 *   enrichedChildChunks,
 *   'retrieval.passage',
 *   true // Late chunking enabled
 * );
 *
 * console.log(`Embedded ${result.metadata.chunk_count} chunks`);
 * console.log(`Late chunking: ${result.metadata.late_chunking_enabled}`);
 *
 * // Upload to Qdrant
 * for (const { chunk, dense_vector } of result.embeddings) {
 *   await qdrantClient.upsert('course_embeddings', {
 *     points: [{
 *       id: chunk.chunk_id,
 *       vector: dense_vector,
 *       payload: toQdrantPayload(chunk)
 *     }]
 *   });
 * }
 * ```
 */
export async function generateEmbeddingsWithLateChunking(
  chunks: EnrichedChunk[],
  task: 'retrieval.passage' | 'retrieval.query' = 'retrieval.passage',
  late_chunking = true
): Promise<BatchEmbeddingResult> {
  if (chunks.length === 0) {
    return {
      embeddings: [],
      total_tokens: 0,
      metadata: {
        chunk_count: 0,
        batch_count: 0,
        late_chunking_enabled: late_chunking,
      },
    };
  }

  // TEMPORARY FIX: Reduced batch size to avoid Jina API 8194 token limit
  // When processing large documents with parent chunks (~1500 tokens each),
  // a batch of 100 can easily exceed 8194 tokens total.
  // TODO: Implement token-aware batching (see docs/Future/TOKEN-AWARE-BATCHING.md)
  const BATCH_SIZE = 5;
  const embeddings: EmbeddingResult[] = [];
  let totalTokens = 0;
  let batchCount = 0;

  // Process chunks in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const textsToEmbed: string[] = [];
    const chunkIndexMap: number[] = []; // Maps API response index to batch index
    const cachedResults: Map<number, number[]> = new Map(); // batch index -> cached embedding

    // Check cache for each chunk in batch
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const cacheKey = generateCacheKey(chunk.content, task);

      try {
        const cached = await cache.get<number[]>(cacheKey);
        if (cached && Array.isArray(cached) && cached.length === 768) {
          cachedResults.set(j, cached);
          logger.debug({
            cacheKey,
            chunkId: chunk.chunk_id,
            task,
          }, 'Embedding cache hit');
        } else {
          // Not in cache or invalid, need to embed
          textsToEmbed.push(chunk.content);
          chunkIndexMap.push(j);
        }
      } catch (error) {
        // Cache error - fall back to API call
        logger.warn({
          err: error,
          chunkId: chunk.chunk_id,
        }, 'Cache read error, falling back to API');
        textsToEmbed.push(chunk.content);
        chunkIndexMap.push(j);
      }
    }

    logger.info({
      batchSize: batch.length,
      cacheHits: cachedResults.size,
      cacheMisses: textsToEmbed.length,
      task,
    }, 'Embedding batch cache status');

    // If we have texts that need embedding, call API
    if (textsToEmbed.length > 0) {
      try {
        // Make request with late chunking enabled
        const response = await makeJinaV3Request({
          model: 'jina-embeddings-v3',
          input: textsToEmbed,
          task,
          dimensions: 768, // Match Qdrant collection
          late_chunking, // Enable context-aware embeddings
        });

        // Validate and extract embeddings
        if (response.data.length !== textsToEmbed.length) {
          throw new Error(
            `Embedding count mismatch: expected ${textsToEmbed.length}, got ${response.data.length}`
          );
        }

        // Cache newly generated embeddings
        for (let apiIndex = 0; apiIndex < response.data.length; apiIndex++) {
          const batchIndex = chunkIndexMap[apiIndex];
          const chunk = batch[batchIndex];
          const embeddingData = response.data[apiIndex];

          // Validate embedding dimensions
          if (embeddingData.embedding.length !== 768) {
            throw new Error(
              `Invalid embedding dimensions: expected 768, got ${embeddingData.embedding.length}`
            );
          }

          // Cache the embedding with 1-hour TTL
          const cacheKey = generateCacheKey(chunk.content, task);
          try {
            const cacheResult = await cache.set(cacheKey, embeddingData.embedding, {
              ttl: EMBEDDING_CACHE_TTL,
            });
            if (cacheResult) {
              logger.debug({
                cacheKey: cacheKey.substring(0, 30) + '...',
                chunkId: chunk.chunk_id,
                ttl: EMBEDDING_CACHE_TTL,
              }, 'Embedding cached successfully');
            } else {
              logger.warn({
                cacheKey: cacheKey.substring(0, 30) + '...',
                chunkId: chunk.chunk_id,
              }, 'Cache write returned false - Redis may not be connected');
            }
          } catch (error) {
            // Log cache write error but continue
            logger.warn({
              err: error instanceof Error ? error.message : String(error),
              chunkId: chunk.chunk_id,
            }, 'Cache write error, continuing without caching');
          }

          cachedResults.set(batchIndex, embeddingData.embedding);
        }

        totalTokens += response.usage.total_tokens;
        batchCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({
          batchNumber: batchCount + 1,
          batchSize: textsToEmbed.length,
          err: errorMessage,
        }, 'Embedding batch failed after all retries');
        throw new Error(
          `Failed to generate embeddings for batch ${batchCount + 1}: ${errorMessage}`
        );
      }
    }

    // Log batch progress
    if (batchCount > 0) {
      logger.info({
        batchNumber: batchCount,
        processedChunks: embeddings.length,
        totalChunks: chunks.length,
        progressPercent: Math.round((embeddings.length / chunks.length) * 100),
      }, 'Embedding batch completed');
    }

    // Build final embeddings array from cached and newly generated embeddings
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = cachedResults.get(j);

      if (!embedding) {
        throw new Error(
          `Missing embedding for chunk ${chunk.chunk_id} at batch index ${j}`
        );
      }

      embeddings.push({
        chunk,
        dense_vector: embedding,
        token_count: chunk.token_count,
      });
    }
  }

  return {
    embeddings,
    total_tokens: totalTokens,
    metadata: {
      chunk_count: embeddings.length,
      batch_count: batchCount,
      late_chunking_enabled: late_chunking,
    },
  };
}

/**
 * Generates embedding for a single query (no late chunking needed for queries)
 *
 * @param queryText - Query text
 * @returns 768-dimensional dense embedding
 *
 * @example
 * ```typescript
 * import { generateQueryEmbedding } from './generate';
 *
 * const queryVector = await generateQueryEmbedding(
 *   "What is machine learning?"
 * );
 *
 * // Search Qdrant
 * const results = await qdrantClient.search('course_embeddings', {
 *   vector: queryVector,
 *   limit: 10
 * });
 * ```
 */
export async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  const cacheKey = generateCacheKey(queryText, 'retrieval.query');

  // Check cache first
  try {
    const cached = await cache.get<number[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length === 768) {
      logger.debug({
        cacheKey,
        queryLength: queryText.length,
      }, 'Query embedding cache hit');
      return cached;
    }
  } catch (error) {
    // Cache error - fall back to API call
    logger.warn({
      err: error,
      queryLength: queryText.length,
    }, 'Cache read error for query embedding, falling back to API');
  }

  // Cache miss - generate embedding via API
  logger.debug({
    cacheKey,
    queryLength: queryText.length,
  }, 'Query embedding cache miss');

  validateJinaConfig();
  await rateLimiter.waitForSlot();

  const response = await makeJinaV3Request({
    model: 'jina-embeddings-v3',
    input: [queryText],
    task: 'retrieval.query', // Use query-specific adapter
    dimensions: 768,
    late_chunking: false, // Not needed for single query
  });

  const embedding = response.data[0].embedding;

  // Validate dimensions
  if (embedding.length !== 768) {
    throw new Error(`Invalid embedding dimensions: expected 768, got ${embedding.length}`);
  }

  // Cache the embedding with 1-hour TTL
  try {
    await cache.set(cacheKey, embedding, { ttl: EMBEDDING_CACHE_TTL });
    logger.debug({
      cacheKey,
      ttl: EMBEDDING_CACHE_TTL,
    }, 'Query embedding cached');
  } catch (error) {
    // Log cache write error but continue
    logger.warn({
      err: error,
      queryLength: queryText.length,
    }, 'Cache write error for query embedding, continuing without caching');
  }

  return embedding;
}

/**
 * Health check for Jina API with late chunking support
 *
 * @returns True if API is accessible
 */
export async function healthCheck(): Promise<boolean> {
  try {
    validateJinaConfig();

    const testResponse = await makeJinaV3Request({
      model: 'jina-embeddings-v3',
      input: ['test'],
      task: 'retrieval.query',
      dimensions: 768,
      late_chunking: false,
    });

    return testResponse.data[0].embedding.length === 768;
  } catch (error) {
    throw new Error(
      `Jina API health check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Utility: Split chunks into parent and child for different embedding strategies
 *
 * Strategy:
 * - Parent chunks: Embed WITHOUT late chunking (standalone context)
 * - Child chunks: Embed WITH late chunking (context-aware)
 *
 * @param chunks - All enriched chunks
 * @returns Separated parent and child chunks
 */
export function separateChunksByLevel(chunks: EnrichedChunk[]): {
  parentChunks: EnrichedChunk[];
  childChunks: EnrichedChunk[];
} {
  const parentChunks = chunks.filter(chunk => chunk.level === 'parent');
  const childChunks = chunks.filter(chunk => chunk.level === 'child');

  return { parentChunks, childChunks };
}
