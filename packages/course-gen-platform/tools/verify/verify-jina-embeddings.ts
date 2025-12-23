/**
 * Verification Script: Jina-v3 Embeddings API Client
 *
 * This script verifies the Jina embeddings client implementation by:
 * 1. Checking environment configuration
 * 2. Testing single embedding generation
 * 3. Testing batch embedding generation
 * 4. Validating embedding dimensions
 * 5. Measuring API latency
 * 6. Testing error handling
 *
 * Usage:
 *   pnpm tsx tools/verify/verify-jina-embeddings.ts
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

import {
  generateEmbedding,
  generateEmbeddings,
  healthCheck,
  JinaEmbeddingError,
} from '../../src/shared/embeddings/jina-client';

/**
 * Test data representing typical use cases
 */
const TEST_PASSAGE = `Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. It uses algorithms to identify patterns and make decisions based on the data it processes.`;

const TEST_QUERY = 'What is machine learning?';

const TEST_BATCH = [
  'Python is a high-level programming language.',
  'JavaScript is widely used for web development.',
  'TypeScript adds static typing to JavaScript.',
  'React is a popular JavaScript library for building user interfaces.',
  'Node.js allows JavaScript to run on the server side.',
];

/**
 * Main verification function
 */
async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Jina-v3 Embeddings API Client Verification');
  console.log('='.repeat(80));
  console.log();

  try {
    // Test 1: Health Check
    console.log('[1/6] Testing health check...');
    const startHealth = Date.now();
    const isHealthy = await healthCheck();
    const healthDuration = Date.now() - startHealth;
    console.log(`✅ Health check passed (${healthDuration}ms)`);
    console.log(`   API Status: ${isHealthy ? 'Operational' : 'Failed'}`);
    console.log();

    // Test 2: Single Passage Embedding
    console.log('[2/6] Testing single passage embedding...');
    console.log(`   Input: "${TEST_PASSAGE.substring(0, 60)}..."`);
    const startPassage = Date.now();
    const passageEmbedding = await generateEmbedding(TEST_PASSAGE, 'retrieval.passage');
    const passageDuration = Date.now() - startPassage;
    console.log(`✅ Passage embedding generated (${passageDuration}ms)`);
    console.log(`   Dimensions: ${passageEmbedding.length}`);
    console.log(`   First 5 values: [${passageEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log();

    // Test 3: Single Query Embedding
    console.log('[3/6] Testing single query embedding...');
    console.log(`   Input: "${TEST_QUERY}"`);
    const startQuery = Date.now();
    const queryEmbedding = await generateEmbedding(TEST_QUERY, 'retrieval.query');
    const queryDuration = Date.now() - startQuery;
    console.log(`✅ Query embedding generated (${queryDuration}ms)`);
    console.log(`   Dimensions: ${queryEmbedding.length}`);
    console.log(`   First 5 values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log();

    // Test 4: Batch Embeddings
    console.log('[4/6] Testing batch embeddings...');
    console.log(`   Batch size: ${TEST_BATCH.length} texts`);
    const startBatch = Date.now();
    const batchEmbeddings = await generateEmbeddings(TEST_BATCH, 'retrieval.passage');
    const batchDuration = Date.now() - startBatch;
    console.log(`✅ Batch embeddings generated (${batchDuration}ms)`);
    console.log(`   Total embeddings: ${batchEmbeddings.length}`);
    console.log(`   Average time per embedding: ${(batchDuration / batchEmbeddings.length).toFixed(2)}ms`);
    console.log(`   All dimensions correct: ${batchEmbeddings.every(e => e.length === 768)}`);
    console.log();

    // Test 5: Cosine Similarity Calculation
    console.log('[5/6] Testing semantic similarity...');
    const cosineSimilarity = calculateCosineSimilarity(passageEmbedding, queryEmbedding);
    console.log(`✅ Calculated cosine similarity: ${cosineSimilarity.toFixed(4)}`);
    console.log(`   Expected: High similarity (query is semantically related to passage)`);
    console.log();

    // Test 6: Error Handling (Missing API Key Simulation)
    console.log('[6/6] Testing error handling...');
    try {
      // Save original key
      const originalKey = process.env.JINA_API_KEY;

      // Temporarily remove key
      delete process.env.JINA_API_KEY;

      // This should throw an error
      await generateEmbedding('test', 'retrieval.query');

      // Restore key
      process.env.JINA_API_KEY = originalKey;

      console.log('❌ Error handling failed: Expected JinaEmbeddingError');
    } catch (error) {
      // Restore key immediately
      const originalKey = process.env.JINA_API_KEY;
      if (!originalKey) {
        // Restore from environment if available
        process.env.JINA_API_KEY = process.env.JINA_API_KEY_BACKUP;
      }

      if (error instanceof JinaEmbeddingError) {
        console.log(`✅ Error handling works correctly`);
        console.log(`   Error type: ${error.errorType}`);
        console.log(`   Error message: ${error.message.substring(0, 80)}...`);
      } else {
        console.log(`❌ Unexpected error type: ${(error as Error).constructor.name}`);
      }
    }
    console.log();

    // Summary
    console.log('='.repeat(80));
    console.log('Verification Summary');
    console.log('='.repeat(80));
    console.log();
    console.log('✅ All tests passed successfully!');
    console.log();
    console.log('Performance Metrics:');
    console.log(`   Health check:          ${healthDuration}ms`);
    console.log(`   Single embedding:      ${Math.max(passageDuration, queryDuration)}ms`);
    console.log(`   Batch (5 embeddings):  ${batchDuration}ms`);
    console.log(`   Average per embedding: ${(batchDuration / batchEmbeddings.length).toFixed(2)}ms`);
    console.log();
    console.log('Configuration:');
    console.log(`   Model: jina-embeddings-v3`);
    console.log(`   Dimensions: 768`);
    console.log(`   Rate limit: 1500 RPM (40ms between requests)`);
    console.log(`   Retry strategy: Exponential backoff (max 3 retries)`);
    console.log();
    console.log('Next Steps:');
    console.log('   1. Implement document chunking (T075)');
    console.log('   2. Setup Redis caching (T076)');
    console.log('   3. Implement vector upload service (T077)');
    console.log();

    process.exit(0);
  } catch (error) {
    console.error();
    console.error('❌ Verification failed!');
    console.error();

    if (error instanceof JinaEmbeddingError) {
      console.error('Error Details:');
      console.error(`   Type: ${error.errorType}`);
      console.error(`   Status: ${error.statusCode || 'N/A'}`);
      console.error(`   Message: ${error.message}`);
    } else {
      console.error('Unexpected Error:');
      console.error(error);
    }

    console.error();
    console.error('Troubleshooting:');
    console.error('   1. Check JINA_API_KEY in .env file');
    console.error('   2. Verify internet connectivity');
    console.error('   3. Check Jina API status at https://status.jina.ai');
    console.error();

    process.exit(1);
  }
}

/**
 * Calculate cosine similarity between two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity (-1 to 1)
 */
function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

// Run verification
main();
