/**
 * Qdrant Vector Database Client Singleton
 *
 * This module provides a singleton instance of the Qdrant client for vector database operations.
 * The client connects to Qdrant Cloud using REST API and is configured via environment variables.
 *
 * @module shared/qdrant/client
 * @see https://qdrant.tech/documentation/
 */

import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Validates required Qdrant environment variables
 *
 * @throws {Error} If QDRANT_URL or QDRANT_API_KEY are not set
 */
function validateQdrantConfig(): void {
  const requiredEnvVars = ['QDRANT_URL', 'QDRANT_API_KEY'] as const;
  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Qdrant environment variables: ${missing.join(', ')}. ` +
      'Please ensure these are set in your .env file.'
    );
  }
}

/**
 * Lazy-initialized singleton Qdrant client instance
 */
let clientInstance: QdrantClient | null = null;

/**
 * Gets or creates the Qdrant client singleton instance
 *
 * @returns {QdrantClient} Configured Qdrant client instance
 * @throws {Error} If environment variables are missing or invalid
 */
function getQdrantClient(): QdrantClient {
  if (!clientInstance) {
    validateQdrantConfig();

    const url = process.env.QDRANT_URL!;
    const apiKey = process.env.QDRANT_API_KEY!;

    // Initialize Qdrant client with REST API
    clientInstance = new QdrantClient({
      url,
      apiKey,
    });
  }

  return clientInstance;
}

/**
 * Singleton Qdrant client instance
 *
 * This instance is created lazily on first access and reused across the application.
 * It connects to Qdrant Cloud using the REST API.
 *
 * @example
 * ```typescript
 * import { qdrantClient } from '@/shared/qdrant/client';
 *
 * // Get all collections
 * const collections = await qdrantClient.getCollections();
 *
 * // Get specific collection info
 * const collectionInfo = await qdrantClient.getCollection('my-collection');
 *
 * // Access raw API methods
 * await qdrantClient.api('collections').getCollections();
 * ```
 *
 * @throws {Error} If QDRANT_URL or QDRANT_API_KEY environment variables are not set
 */
export const qdrantClient = new Proxy({} as QdrantClient, {
  get(_target, prop) {
    const client = getQdrantClient();
    const value = client[prop as keyof QdrantClient];
    return typeof value === 'function' ? (value as CallableFunction).bind(client) : value;
  },
});

/**
 * Type export for use in other modules
 *
 * @example
 * ```typescript
 * import type { QdrantClient } from '@/shared/qdrant/client';
 *
 * function processVectors(client: QdrantClient) {
 *   // ...
 * }
 * ```
 */
export type { QdrantClient };
