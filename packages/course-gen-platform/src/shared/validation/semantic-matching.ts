/**
 * Semantic matching using Jina embeddings
 *
 * When strict validation fails, finds the closest valid enum value
 * using cosine similarity of embeddings.
 *
 * Features:
 * - 768-dimensional embeddings (Jina-embeddings-v3)
 * - Task-specific embeddings: "retrieval.query" for short enum values
 * - Rate limiting: 1500 RPM (40ms between requests)
 * - Latency: ~50ms
 * - Accuracy: 90%+ for semantic matches
 *
 * @module shared/validation/semantic-matching
 * @see docs/investigations/INV-2025-11-19-007-preprocessing-semantic-validation.md
 */

import { generateEmbedding, generateEmbeddings } from '@/shared/embeddings/jina-client';
import type { LlmCostContext } from '@/shared/metrics/llm-cost';
import logger from '@/shared/logger';

export interface SemanticMatchResult {
  /** Matched valid value */
  matched: string;
  /** Cosine similarity score (0-1) */
  similarity: number;
  /** Whether match was successful */
  success: boolean;
  /** Original invalid value */
  originalValue: string;
}

/**
 * In-memory cache for enum embeddings
 * Computed once at startup, reused for all validations
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Get embedding for a text value
 *
 * Uses Jina-embeddings-v3 with task="retrieval.query" for short enum values.
 * Results are cached in-memory for performance.
 *
 * A cache hit spends nothing and is therefore never priced; only the miss below
 * reaches the paid API, and it carries whatever course the caller named.
 *
 * @param text - Text to embed (typically an enum value)
 * @param costContext - Course to charge a cache miss to, when the caller has one
 * @returns 768-dimensional embedding vector
 */
async function getEmbedding(text: string, costContext?: LlmCostContext): Promise<number[]> {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }

  try {
    // Use retrieval.query for short enum values (optimized for search)
    const embedding = await generateEmbedding(text, 'retrieval.query', costContext);
    embeddingCache.set(text, embedding);
    return embedding;
  } catch (error) {
    logger.error({ error, text }, 'Failed to get embedding');
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score (0-1)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find closest valid enum value using semantic similarity
 *
 * @param invalidValue - The invalid value from LLM
 * @param validValues - Array of valid enum values
 * @param threshold - Minimum similarity score to accept match (default: 0.85)
 * @param costContext - Course whose ledger these embeddings belong to
 * @returns Match result with similarity score
 */
export async function findSemanticMatch(
  invalidValue: string,
  validValues: string[],
  threshold: number = 0.85,
  costContext?: LlmCostContext
): Promise<SemanticMatchResult> {
  try {
    logger.info({ invalidValue, validValues, threshold }, '[Semantic Matching] Starting');

    // Get embedding for invalid value
    const invalidEmbedding = await getEmbedding(invalidValue, costContext);

    // Get embeddings for all valid values (cached after first call)
    const validEmbeddings = await Promise.all(validValues.map(v => getEmbedding(v, costContext)));

    // Find closest match
    let bestMatch = validValues[0];
    let bestSimilarity = 0;

    for (let i = 0; i < validValues.length; i++) {
      const similarity = cosineSimilarity(invalidEmbedding, validEmbeddings[i]);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = validValues[i];
      }
    }

    const success = bestSimilarity >= threshold;

    logger.info(
      {
        invalidValue,
        matched: bestMatch,
        similarity: bestSimilarity,
        threshold,
        success,
      },
      '[Semantic Matching] Result'
    );

    return {
      matched: bestMatch,
      similarity: bestSimilarity,
      success,
      originalValue: invalidValue,
    };
  } catch (error) {
    logger.error({ error, invalidValue, validValues }, '[Semantic Matching] Failed');

    return {
      matched: validValues[0], // Fallback to first valid value
      similarity: 0,
      success: false,
      originalValue: invalidValue,
    };
  }
}

/**
 * Warm up embedding cache with valid enum values
 * Call at application startup
 *
 * Uses batch embeddings for efficiency (up to 100 texts per API request).
 *
 * This one batch is process-wide and runs before any course exists, so its only
 * caller passes no context and the call is recorded as unattributed rather than
 * charged to whichever course happened to arrive first. Every later value comes
 * from the cache it fills, so the API is not paid again.
 *
 * @param enumFields - Object with field names and valid values
 * @param costContext - Course to charge the warm-up batch to, if one owns it
 */
export async function warmupEmbeddingCache(
  enumFields: Record<string, string[]>,
  costContext?: LlmCostContext
): Promise<void> {
  logger.info('[Semantic Matching] Warming up embedding cache');

  // Collect all unique values
  const allValues = new Set<string>();
  for (const values of Object.values(enumFields)) {
    values.forEach(v => allValues.add(v));
  }

  const valuesArray = Array.from(allValues);

  // Batch request for all values (more efficient than individual requests)
  // Jina API handles batching internally (up to 100 texts per request)
  const embeddings = await generateEmbeddings(valuesArray, 'retrieval.query', costContext);

  // Save to cache
  valuesArray.forEach((value, index) => {
    embeddingCache.set(value, embeddings[index]);
  });

  logger.info({ cachedCount: embeddingCache.size }, '[Semantic Matching] Cache warmed up');
}
