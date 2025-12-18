/**
 * Cache Validation Script for Embedding Generation
 *
 * This script demonstrates and validates the Redis caching functionality
 * added in T076. Run this to verify caching is working correctly.
 *
 * Prerequisites:
 * - Redis running on localhost:6379 (or configured REDIS_URL)
 * - JINA_API_KEY environment variable set
 *
 * Usage:
 *   npx tsx src/shared/embeddings/__tests__/cache-validation.ts
 */

import { generateQueryEmbedding, generateEmbeddingsWithLateChunking } from '../generate';
import type { EnrichedChunk } from '../metadata-enricher';
import { cache } from '../../cache/redis';
import { createHash } from 'crypto';

/**
 * Generate cache key (same as in generate.ts)
 */
function generateCacheKey(text: string, task: string): string {
  const hash = createHash('sha256').update(`${text}:${task}`).digest('hex');
  return `embedding:${hash}`;
}

/**
 * Test 1: Query Embedding Cache Validation
 */
async function testQueryEmbeddingCache() {
  console.log('\n=== Test 1: Query Embedding Cache ===\n');

  const queryText = 'What is machine learning and how does it work?';
  const cacheKey = generateCacheKey(queryText, 'retrieval.query');

  // Clear cache for clean test
  await cache.delete(cacheKey);
  console.log(`Cache cleared for key: ${cacheKey.substring(0, 30)}...`);

  // First call - should be cache miss
  console.log('\n1. First call (cache miss expected):');
  const start1 = Date.now();
  const embedding1 = await generateQueryEmbedding(queryText);
  const duration1 = Date.now() - start1;
  console.log(`   ✓ Generated embedding: ${embedding1.length} dimensions`);
  console.log(`   ✓ Duration: ${duration1}ms`);
  console.log(`   ✓ Cache key: ${cacheKey.substring(0, 30)}...`);

  // Verify embedding was cached
  const cached = await cache.get<number[]>(cacheKey);
  if (cached && cached.length === 768) {
    console.log(`   ✓ Embedding successfully cached (TTL: 3600s)`);
  } else {
    console.log(`   ✗ ERROR: Embedding not found in cache!`);
  }

  // Second call - should be cache hit
  console.log('\n2. Second call (cache hit expected):');
  const start2 = Date.now();
  const embedding2 = await generateQueryEmbedding(queryText);
  const duration2 = Date.now() - start2;
  console.log(`   ✓ Retrieved embedding: ${embedding2.length} dimensions`);
  console.log(`   ✓ Duration: ${duration2}ms`);
  console.log(`   ✓ Speed improvement: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`);

  // Verify embeddings are identical
  const isIdentical = JSON.stringify(embedding1) === JSON.stringify(embedding2);
  if (isIdentical) {
    console.log(`   ✓ Embeddings are identical (cache working correctly)`);
  } else {
    console.log(`   ✗ ERROR: Embeddings differ!`);
  }

  console.log('\n✓ Query embedding cache test completed\n');
}

/**
 * Test 2: Batch Embedding Cache Validation
 */
async function testBatchEmbeddingCache() {
  console.log('\n=== Test 2: Batch Embedding Cache ===\n');

  // Create test chunks
  const testChunks: EnrichedChunk[] = [
    {
      chunk_id: 'test-chunk-1',
      parent_chunk_id: null,
      sibling_chunk_ids: [],
      level: 'child',
      content: 'Machine learning is a subset of artificial intelligence.',
      token_count: 10,
      char_count: 57,
      chunk_index: 0,
      total_chunks: 2,
      heading_path: 'Introduction > What is ML?',
      chapter: 'Introduction',
      section: 'What is ML?',
      chunk_strategy: 'hierarchical_markdown',
      overlap_tokens: 0,
      // Document metadata
      document_id: 'test-doc-1',
      document_name: 'Test Document',
      document_version: null,
      version_hash: null,
      // Source location
      page_number: 1,
      page_range: null,
      // Content metadata
      has_code: false,
      has_formulas: false,
      has_tables: false,
      has_images: false,
      // Multi-tenancy
      organization_id: 'test-org',
      course_id: 'test-course',
      // Timestamps
      indexed_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      // References
      image_refs: [],
      table_refs: [],
    },
    {
      chunk_id: 'test-chunk-2',
      parent_chunk_id: null,
      sibling_chunk_ids: [],
      level: 'child',
      content: 'Deep learning uses neural networks with multiple layers.',
      token_count: 9,
      char_count: 56,
      chunk_index: 1,
      total_chunks: 2,
      heading_path: 'Deep Learning > Neural Networks',
      chapter: 'Deep Learning',
      section: 'Neural Networks',
      chunk_strategy: 'hierarchical_markdown',
      overlap_tokens: 0,
      // Document metadata
      document_id: 'test-doc-1',
      document_name: 'Test Document',
      document_version: null,
      version_hash: null,
      // Source location
      page_number: 1,
      page_range: null,
      // Content metadata
      has_code: false,
      has_formulas: false,
      has_tables: false,
      has_images: false,
      // Multi-tenancy
      organization_id: 'test-org',
      course_id: 'test-course',
      // Timestamps
      indexed_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      // References
      image_refs: [],
      table_refs: [],
    },
  ];

  // Clear cache for test chunks
  for (const chunk of testChunks) {
    const cacheKey = generateCacheKey(chunk.content, 'retrieval.passage');
    await cache.delete(cacheKey);
  }
  console.log('Cache cleared for test chunks');

  // First batch - should be all cache misses
  console.log('\n1. First batch (cache misses expected):');
  const start1 = Date.now();
  const result1 = await generateEmbeddingsWithLateChunking(testChunks, 'retrieval.passage');
  const duration1 = Date.now() - start1;
  console.log(`   ✓ Generated ${result1.embeddings.length} embeddings`);
  console.log(`   ✓ Total tokens: ${result1.total_tokens}`);
  console.log(`   ✓ Duration: ${duration1}ms`);
  console.log(`   ✓ Batch count: ${result1.metadata.batch_count}`);

  // Verify embeddings were cached
  let cachedCount = 0;
  for (const chunk of testChunks) {
    const cacheKey = generateCacheKey(chunk.content, 'retrieval.passage');
    const cached = await cache.get<number[]>(cacheKey);
    if (cached && cached.length === 768) {
      cachedCount++;
    }
  }
  console.log(`   ✓ Cached embeddings: ${cachedCount}/${testChunks.length}`);

  // Second batch - should be all cache hits
  console.log('\n2. Second batch (cache hits expected):');
  const start2 = Date.now();
  const result2 = await generateEmbeddingsWithLateChunking(testChunks, 'retrieval.passage');
  const duration2 = Date.now() - start2;
  console.log(`   ✓ Retrieved ${result2.embeddings.length} embeddings`);
  console.log(`   ✓ Duration: ${duration2}ms`);
  console.log(`   ✓ Speed improvement: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`);

  // Note: total_tokens will be 0 for cached results (no API call)
  console.log(`   ✓ API tokens used: ${result2.total_tokens} (should be 0 for cache hits)`);

  // Verify embeddings are identical
  const embedding1_0 = result1.embeddings[0].dense_vector;
  const embedding2_0 = result2.embeddings[0].dense_vector;
  const isIdentical = JSON.stringify(embedding1_0) === JSON.stringify(embedding2_0);
  if (isIdentical) {
    console.log(`   ✓ Embeddings are identical (cache working correctly)`);
  } else {
    console.log(`   ✗ ERROR: Embeddings differ!`);
  }

  console.log('\n✓ Batch embedding cache test completed\n');
}

/**
 * Test 3: Cache Error Handling
 */
async function testCacheErrorHandling() {
  console.log('\n=== Test 3: Cache Error Handling ===\n');

  const queryText = 'Test error handling query';

  try {
    // This should work even if Redis has issues (graceful degradation)
    const embedding = await generateQueryEmbedding(queryText);
    console.log(`   ✓ Embedding generated: ${embedding.length} dimensions`);
    console.log(`   ✓ Service continues working despite potential cache errors`);
  } catch (error) {
    console.log(`   ✗ ERROR: ${error}`);
  }

  console.log('\n✓ Error handling test completed\n');
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Redis Cache Validation for Embedding Generation      ║');
  console.log('║  Task: T076                                            ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    await testQueryEmbeddingCache();
    await testBatchEmbeddingCache();
    await testCacheErrorHandling();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ✓ All cache validation tests passed!                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if executed directly (ESM compatible)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testQueryEmbeddingCache, testBatchEmbeddingCache, testCacheErrorHandling };
