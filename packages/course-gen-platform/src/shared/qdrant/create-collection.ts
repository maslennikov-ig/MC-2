/**
 * Qdrant Collection Creation Script
 *
 * Creates the `course_embeddings` collection with optimized HNSW configuration
 * for semantic search over course content using Jina-v3 embeddings (768 dimensions).
 *
 * Configuration:
 * - Vector size: 768 (Jina-v3 embedding dimensions)
 * - Distance metric: Cosine (optimal for text embeddings)
 * - HNSW parameters: m=16, ef_construct=100 (balanced performance)
 * - Payload indexes: course_id, organization_id (for filtering)
 *
 * @module shared/qdrant/create-collection
 * @see https://qdrant.tech/documentation/concepts/collections/
 */

import 'dotenv/config';
import { qdrantClient } from './client';
import { logger } from '../logger/index.js';

/**
 * Type guard for Qdrant API errors with status property
 */
interface QdrantError {
  status?: number;
  message?: string;
  stack?: string;
}

/**
 * Type guard to check if error is a Qdrant error with status
 */
function isQdrantError(error: unknown): error is QdrantError {
  return (
    error !== null &&
    typeof error === 'object' &&
    ('status' in error || 'message' in error)
  );
}

/**
 * Safely extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isQdrantError(error) && error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * Collection configuration constants
 * Supports hybrid search with dense (Jina-v3) and sparse (BM25) vectors
 */
export const COLLECTION_CONFIG = {
  /** Name of the collection for course embeddings */
  name: 'course_embeddings',

  /** Named vectors configuration for hybrid search */
  vectors: {
    /** Dense semantic vectors (Jina-v3 embeddings) */
    dense: {
      /** Jina-v3 embedding dimensions */
      size: 768,
      /** Cosine distance for semantic similarity */
      distance: 'Cosine' as const,
      /** HNSW index configuration for optimal performance */
      hnsw_config: {
        /** Number of bi-directional links per node (balanced accuracy/memory) */
        m: 16,
        /** Construction-time search depth (higher = better quality index) */
        ef_construct: 100,
      },
    },
  },

  /** Sparse vectors configuration for BM25 lexical search */
  sparse_vectors: {
    /** BM25 sparse vectors for lexical matching */
    sparse: {
      /** Sparse index configuration */
      index: {
        /** Store index in memory for fast access */
        on_disk: false,
      },
    },
  },

  /** Optimizer configuration */
  optimizers_config: {
    /** Start HNSW indexing after 20K vectors (recommended for production) */
    indexing_threshold: 20000,
  },
} as const;

/**
 * Payload indexes for efficient filtering
 * Required for multi-tenant isolation and course-specific queries
 */
export const PAYLOAD_INDEXES = [
  {
    field_name: 'document_id',
    field_schema: 'keyword' as const, // Use keyword for UUID strings (not uuid type)
  },
  {
    field_name: 'course_id',
    field_schema: 'keyword' as const, // Use keyword for UUID strings (not uuid type)
  },
  {
    field_name: 'organization_id',
    field_schema: 'keyword' as const, // Use keyword for UUID strings (not uuid type)
  },
] as const;

/**
 * Checks if a collection exists in Qdrant
 *
 * @param collectionName - Name of the collection to check
 * @returns True if collection exists, false otherwise
 */
async function collectionExists(collectionName: string): Promise<boolean> {
  try {
    await qdrantClient.getCollection(collectionName);
    return true;
  } catch (error: unknown) {
    // Collection doesn't exist if we get a 404 error
    if (isQdrantError(error)) {
      if (error.status === 404 || error.message?.includes('Not found')) {
        return false;
      }
    }

    // Log unexpected errors for debugging
    logger.error({
      collectionName,
      err: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Unexpected error checking collection existence');

    // Re-throw other errors
    throw error;
  }
}

/**
 * Creates the course_embeddings collection with HNSW configuration
 *
 * This operation is idempotent - it will skip creation if the collection
 * already exists and will report the existing configuration.
 *
 * @throws {Error} If collection creation fails or connection issues occur
 */
async function createCourseEmbeddingsCollection(): Promise<void> {
  logger.info('Starting Qdrant collection creation process');

  // Validate environment configuration
  logger.info('Validating Qdrant connection');
  try {
    const collections = await qdrantClient.getCollections();
    logger.info({
      collectionsCount: collections.collections.length
    }, 'Connected to Qdrant');
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    logger.error({
      err: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Qdrant connection failed');

    throw new Error(
      'Cannot connect to Qdrant. Please ensure QDRANT_URL and QDRANT_API_KEY are set correctly. ' +
      `Error: ${errorMessage}`
    );
  }

  // Check if collection already exists
  logger.info({
    collectionName: COLLECTION_CONFIG.name
  }, 'Checking if collection exists');
  const exists = await collectionExists(COLLECTION_CONFIG.name);

  if (exists) {
    logger.info({
      collectionName: COLLECTION_CONFIG.name
    }, 'Collection already exists');

    // Get and display existing collection info
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_CONFIG.name);
    logger.info({
      collectionName: COLLECTION_CONFIG.name,
      config: collectionInfo,
    }, 'Existing collection configuration');
    logger.info('Skipping collection creation (already exists)');
    return;
  }

  // Create the collection
  logger.info({
    collectionName: COLLECTION_CONFIG.name,
    denseVectorSize: COLLECTION_CONFIG.vectors.dense.size,
    denseVectorDistance: COLLECTION_CONFIG.vectors.dense.distance,
    hnswM: COLLECTION_CONFIG.vectors.dense.hnsw_config.m,
    hnswEfConstruct: COLLECTION_CONFIG.vectors.dense.hnsw_config.ef_construct,
    sparseIndexOnDisk: COLLECTION_CONFIG.sparse_vectors.sparse.index.on_disk,
    indexingThreshold: COLLECTION_CONFIG.optimizers_config.indexing_threshold,
  }, 'Creating collection');

  await qdrantClient.createCollection(COLLECTION_CONFIG.name, {
    vectors: COLLECTION_CONFIG.vectors,
    sparse_vectors: COLLECTION_CONFIG.sparse_vectors,
    optimizers_config: COLLECTION_CONFIG.optimizers_config,
  });

  logger.info({
    collectionName: COLLECTION_CONFIG.name
  }, 'Collection created successfully');

  // Create payload indexes
  logger.info('Creating payload indexes for filtering');

  for (const index of PAYLOAD_INDEXES) {
    logger.info({
      fieldName: index.field_name,
      fieldSchema: index.field_schema,
    }, 'Creating payload index');

    await qdrantClient.createPayloadIndex(COLLECTION_CONFIG.name, {
      field_name: index.field_name,
      field_schema: index.field_schema,
    });

    logger.info({
      fieldName: index.field_name,
    }, 'Payload index created successfully');
  }

  logger.info('All payload indexes created successfully');

  // Verify final configuration
  logger.info('Verifying collection configuration');
  const collectionInfo = await qdrantClient.getCollection(COLLECTION_CONFIG.name);

  logger.info({
    collectionName: COLLECTION_CONFIG.name,
    config: collectionInfo,
  }, 'Final collection configuration');

  logger.info('Collection setup complete');
  logger.info({
    steps: [
      'Configure Jina-v3 embeddings API client (T074)',
      'Implement document chunking strategy (T075)',
      'Implement embedding generation service (T076)',
    ],
  }, 'Next steps');
}

/**
 * Main execution function
 * Handles errors and provides clear feedback to the user
 */
async function main(): Promise<void> {
  try {
    await createCourseEmbeddingsCollection();
    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    logger.error({
      err: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Collection creation failed in main');

    process.exit(1);
  }
}

// Execute if run directly (ESM compatible)
// Note: This check only works when running with tsx or node directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '');
if (isMainModule) {
  main().catch((error) => {
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Fatal error during collection creation');
    process.exit(1);
  });
}

// Export for programmatic use
export { createCourseEmbeddingsCollection };
