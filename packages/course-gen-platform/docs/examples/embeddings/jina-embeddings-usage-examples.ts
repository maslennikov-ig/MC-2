/**
 * Jina Embeddings Client - Usage Examples
 *
 * This file demonstrates common usage patterns for the Jina-v3 embeddings client.
 * These examples show how to integrate the client with Qdrant for RAG workflows.
 *
 * @module shared/embeddings/example-usage
 */

import {
  generateEmbedding,
  generateEmbeddings,
  healthCheck,
  JinaEmbeddingError,
} from './jina-client';
import { qdrantClient } from '../qdrant/client';

/**
 * Example 1: Basic Health Check
 *
 * Verify API connectivity on application startup
 */
export async function exampleHealthCheck(): Promise<void> {
  try {
    const isHealthy = await healthCheck();
    console.log('Jina API Status:', isHealthy ? 'Operational' : 'Failed');
  } catch (error) {
    if (error instanceof JinaEmbeddingError) {
      console.error('Health check failed:', error.message);
    }
    throw error;
  }
}

/**
 * Example 2: Generate Single Document Embedding
 *
 * Create an embedding for a single document or text chunk
 */
export async function exampleSingleEmbedding(): Promise<void> {
  const documentText = `
    Machine learning is a subset of artificial intelligence that enables
    computers to learn from data without being explicitly programmed.
  `.trim();

  // Generate embedding for indexing
  const embedding = await generateEmbedding(documentText, 'retrieval.passage');

  console.log('Generated embedding:', {
    dimensions: embedding.length,
    firstValues: embedding.slice(0, 5),
  });

  // Store in Qdrant
  await qdrantClient.upsert('knowledge-base', {
    points: [
      {
        id: 'doc-123',
        vector: embedding,
        payload: {
          text: documentText,
          courseId: 'course-1',
          type: 'lesson-content',
        },
      },
    ],
  });

  console.log('Embedding stored in Qdrant');
}

/**
 * Example 3: Batch Embedding Generation
 *
 * Efficiently generate embeddings for multiple text chunks
 */
export async function exampleBatchEmbeddings(): Promise<void> {
  const documentChunks = [
    'Python is a high-level, interpreted programming language.',
    'JavaScript is widely used for web development.',
    'TypeScript adds static typing to JavaScript.',
    'React is a JavaScript library for building UIs.',
    'Node.js allows JavaScript to run on the server.',
  ];

  // Generate embeddings in batch (more efficient than individual calls)
  const embeddings = await generateEmbeddings(
    documentChunks,
    'retrieval.passage'
  );

  console.log(`Generated ${embeddings.length} embeddings`);

  // Prepare points for Qdrant batch upsert
  const points = documentChunks.map((text, index) => ({
    id: `chunk-${index + 1}`,
    vector: embeddings[index],
    payload: {
      text,
      courseId: 'course-1',
      chunkIndex: index,
    },
  }));

  // Batch upsert to Qdrant
  await qdrantClient.upsert('knowledge-base', { points });

  console.log(`Stored ${points.length} vectors in Qdrant`);
}

/**
 * Example 4: Semantic Search with Query Embedding
 *
 * Generate query embedding and search for similar documents
 */
export async function exampleSemanticSearch(): Promise<void> {
  const userQuery = 'What programming languages are used for web development?';

  // Generate query embedding (different task type from passages)
  const queryEmbedding = await generateEmbedding(userQuery, 'retrieval.query');

  // Search for similar vectors in Qdrant
  const searchResults = await qdrantClient.search('knowledge-base', {
    vector: queryEmbedding,
    limit: 5,
    filter: {
      must: [{ key: 'courseId', match: { value: 'course-1' } }],
    },
  });

  console.log('Search results:');
  searchResults.forEach((result, index) => {
    console.log(`${index + 1}. Score: ${result.score}`);
    console.log(`   Text: ${result.payload?.text}`);
  });
}

/**
 * Example 5: Error Handling and Retry Logic
 *
 * Demonstrate proper error handling patterns
 */
export async function exampleErrorHandling(): Promise<void> {
  try {
    // @ts-expect-error - Intentionally unused for example purposes
    const _embedding = await generateEmbedding(
      'Sample text',
      'retrieval.passage'
    );
    console.log('Embedding generated successfully');
  } catch (error) {
    if (error instanceof JinaEmbeddingError) {
      switch (error.errorType) {
        case 'CONFIG_ERROR':
          console.error('Configuration error:', error.message);
          // Fix: Check JINA_API_KEY in .env
          break;

        case 'API_ERROR':
          console.error(`API error (${error.statusCode}):`, error.message);
          // Handle API-specific errors (rate limits, etc.)
          break;

        case 'DIMENSION_MISMATCH':
          console.error('Dimension mismatch:', error.message);
          // This should never happen with proper configuration
          break;

        case 'INVALID_RESPONSE':
          console.error('Invalid API response:', error.message);
          // Retry or alert monitoring
          break;

        default:
          console.error('Unknown error type:', error.message);
      }
    } else {
      console.error('Unexpected error:', error);
    }

    throw error; // Re-throw for upstream handling
  }
}

/**
 * Example 6: RAG Pipeline Integration (Preview)
 *
 * Complete workflow: chunk → embed → store → search
 */
export async function exampleRAGPipeline(): Promise<void> {
  // Step 1: Document chunking (T075 - not yet implemented)
  // @ts-expect-error - Intentionally unused for example purposes
  const _documentText = `
    TypeScript is a strongly typed programming language that builds on JavaScript.
    It adds optional static type checking, which helps catch errors at compile time.
    TypeScript code transpiles to clean JavaScript code that runs in any browser.
  `.trim();

  // For now, manually chunk (T075 will automate this)
  const chunks = [
    'TypeScript is a strongly typed programming language that builds on JavaScript.',
    'It adds optional static type checking, which helps catch errors at compile time.',
    'TypeScript code transpiles to clean JavaScript code that runs in any browser.',
  ];

  // Step 2: Generate embeddings (T074 - current implementation)
  console.log('Generating embeddings...');
  const embeddings = await generateEmbeddings(chunks, 'retrieval.passage');

  // Step 3: Store in Qdrant (T077 will create dedicated service)
  console.log('Storing vectors in Qdrant...');
  const points = chunks.map((text, index) => ({
    id: `typescript-doc-${index + 1}`,
    vector: embeddings[index],
    payload: {
      text,
      courseId: 'typescript-101',
      documentId: 'intro-doc',
      chunkIndex: index,
    },
  }));

  await qdrantClient.upsert('knowledge-base', { points });

  // Step 4: Semantic search
  console.log('Performing semantic search...');
  const query = 'How does TypeScript help with errors?';
  const queryEmbedding = await generateEmbedding(query, 'retrieval.query');

  const results = await qdrantClient.search('knowledge-base', {
    vector: queryEmbedding,
    limit: 2,
    filter: {
      must: [{ key: 'courseId', match: { value: 'typescript-101' } }],
    },
  });

  console.log('Most relevant chunks:');
  results.forEach((result, index) => {
    console.log(`${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   ${result.payload?.text}`);
  });
}

/**
 * Example 7: Performance Optimization with Caching (T076 Preview)
 *
 * Shows where Redis caching will be integrated in T076
 */
export async function exampleCachingStrategy(): Promise<void> {
  const text = 'Frequently accessed content that should be cached';

  // T076 will add Redis caching here
  // For now, every call hits the Jina API
  // @ts-expect-error - Intentionally unused for caching example
  const _embedding1 = await generateEmbedding(text, 'retrieval.passage');
  // @ts-expect-error - Intentionally unused for caching example
  const _embedding2 = await generateEmbedding(text, 'retrieval.passage');

  console.log('Without caching: 2 API calls made');
  console.log('With T076 Redis cache: 1 API call + 1 cache hit');

  // T076 implementation will look like:
  // 1. Hash the text + task type → cache key
  // 2. Check Redis for existing embedding
  // 3. If found, return cached embedding
  // 4. If not found, call Jina API and cache result (TTL: 7 days)
}

/**
 * Example 8: Monitoring and Observability
 *
 * Track embedding generation metrics
 */
export async function exampleMonitoring(): Promise<void> {
  const startTime = Date.now();

  try {
    const texts = ['Sample text 1', 'Sample text 2', 'Sample text 3'];
    const embeddings = await generateEmbeddings(texts, 'retrieval.passage');

    const duration = Date.now() - startTime;
    const avgTime = duration / embeddings.length;

    // Log metrics (in production, send to monitoring service)
    console.log('Embedding Generation Metrics:', {
      count: embeddings.length,
      totalDuration: `${duration}ms`,
      avgDuration: `${avgTime.toFixed(2)}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log error metrics
    console.error('Embedding Generation Failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
    });
  }
}
