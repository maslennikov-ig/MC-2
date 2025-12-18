/**
 * Qdrant Vector Database - Integration Tests
 *
 * Comprehensive integration tests for Qdrant vector database operations.
 * Tests collection management, vector operations, semantic search, filtering,
 * and multi-tenant isolation.
 *
 * Prerequisites:
 * - Qdrant instance running (local or cloud)
 * - QDRANT_URL and QDRANT_API_KEY environment variables set
 * - Test collection will be created/cleaned up automatically
 *
 * Test execution: pnpm test tests/integration/qdrant.test.ts
 *
 * Scenarios covered:
 * 1. Collection creation with HNSW configuration
 * 2. Vector upload operations
 * 3. Semantic search with latency requirements (<30ms p95)
 * 4. Course-based filtering
 * 5. Multi-tenant isolation (organization_id filtering)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { qdrantClient } from '../../src/shared/qdrant/client';
import { COLLECTION_CONFIG } from '../../src/shared/qdrant/create-collection';
import { uploadChunksToQdrant, deleteChunksByCourseId } from '../../src/shared/qdrant/upload';
import { searchChunks } from '../../src/shared/qdrant/search';
import type { EmbeddingResult } from '../../src/shared/embeddings/generate';
import type { EnrichedChunk } from '../../src/shared/embeddings/metadata-enricher';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Test collection name (separate from production)
 */
const TEST_COLLECTION_NAME = 'test_course_embeddings';

/**
 * Test organization IDs for multi-tenancy tests
 */
const TEST_ORG_1 = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_2 = '00000000-0000-0000-0000-000000000002';

/**
 * Test course IDs for filtering tests
 */
const TEST_COURSE_1 = '00000000-0000-0000-0001-000000000001';
const TEST_COURSE_2 = '00000000-0000-0000-0001-000000000002';

/**
 * P95 latency requirement (milliseconds)
 */
const P95_LATENCY_MS = 30;

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Generates a test vector (768 dimensions for Jina-v3)
 * Uses a deterministic pattern based on seed for reproducibility
 */
function generateTestVector(seed: number = 0): number[] {
  const vector: number[] = [];
  for (let i = 0; i < 768; i++) {
    // Generate deterministic values using seed
    vector.push(Math.sin((seed + i) * 0.1) * 0.5 + 0.5);
  }
  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / magnitude);
}

/**
 * Creates a test enriched chunk
 */
function createTestChunk(overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  const chunkId = randomUUID();
  return {
    chunk_id: chunkId,
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child' as const,
    content: 'This is a test chunk for semantic search testing.',
    token_count: 10,
    char_count: 48,
    chunk_index: 0,
    total_chunks: 1,
    chunk_strategy: 'semantic',
    overlap_tokens: 0,
    heading_path: 'Test > Section',
    chapter: 'Test',
    section: 'Section',
    document_id: randomUUID(),
    document_name: 'test-document.pdf',
    document_version: '1.0',
    version_hash: 'test-hash',
    page_number: 1,
    page_range: [1, 1],
    has_code: false,
    has_formulas: false,
    has_tables: false,
    has_images: false,
    organization_id: TEST_ORG_1,
    course_id: TEST_COURSE_1,
    indexed_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    image_refs: [],
    table_refs: [],
    ...overrides,
  };
}

/**
 * Creates a test embedding result
 */
function createTestEmbedding(
  seed: number = 0,
  chunkOverrides: Partial<EnrichedChunk> = {}
): EmbeddingResult {
  const chunk = createTestChunk(chunkOverrides);
  return {
    chunk,
    dense_vector: generateTestVector(seed),
    token_count: chunk.token_count,
  };
}

/**
 * Checks if Qdrant is available
 */
async function isQdrantAvailable(): Promise<boolean> {
  try {
    await qdrantClient.getCollections();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Creates test collection with HNSW configuration
 */
async function createTestCollection(): Promise<void> {
  try {
    // Check if collection exists
    await qdrantClient.getCollection(TEST_COLLECTION_NAME);
    console.log(`Test collection "${TEST_COLLECTION_NAME}" already exists, deleting...`);
    await qdrantClient.deleteCollection(TEST_COLLECTION_NAME);
  } catch (error: any) {
    // Collection doesn't exist, which is fine
    if (error?.status !== 404) {
      throw error;
    }
  }

  // Create test collection with same config as production
  await qdrantClient.createCollection(TEST_COLLECTION_NAME, {
    vectors: COLLECTION_CONFIG.vectors,
    sparse_vectors: COLLECTION_CONFIG.sparse_vectors,
    optimizers_config: COLLECTION_CONFIG.optimizers_config,
  });

  // Create payload indexes for filtering
  await qdrantClient.createPayloadIndex(TEST_COLLECTION_NAME, {
    field_name: 'course_id',
    field_schema: 'keyword',
  });

  await qdrantClient.createPayloadIndex(TEST_COLLECTION_NAME, {
    field_name: 'organization_id',
    field_schema: 'keyword',
  });

  console.log(`Test collection "${TEST_COLLECTION_NAME}" created successfully`);
}

/**
 * Deletes test collection
 */
async function deleteTestCollection(): Promise<void> {
  try {
    await qdrantClient.deleteCollection(TEST_COLLECTION_NAME);
    console.log(`Test collection "${TEST_COLLECTION_NAME}" deleted`);
  } catch (error) {
    console.error('Failed to delete test collection:', error);
  }
}

/**
 * Calculates p95 latency from array of measurements
 */
function calculateP95(measurements: number[]): number {
  if (measurements.length === 0) return 0;
  const sorted = [...measurements].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[index];
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Qdrant Vector Database Integration Tests', () => {
  let qdrantAvailable = false;

  beforeAll(async () => {
    // Check if Qdrant is available
    qdrantAvailable = await isQdrantAvailable();

    if (!qdrantAvailable) {
      console.warn('⚠️  Qdrant is not available - tests will be skipped');
      console.warn('   Please ensure QDRANT_URL and QDRANT_API_KEY are set');
      return;
    }

    console.log('✓ Qdrant connection established');

    // Create test collection
    await createTestCollection();
  }, 30000); // 30s timeout for setup

  afterAll(async () => {
    if (!qdrantAvailable) return;

    // Clean up test collection
    await deleteTestCollection();
  }, 15000); // 15s timeout for cleanup

  // ==========================================================================
  // Scenario 1: Collection Created with HNSW Configuration
  // ==========================================================================

  describe.skipIf(!qdrantAvailable)('Scenario 1: Collection created with HNSW configuration', () => {
    it('should have collection with correct HNSW parameters', async () => {
      // When: Retrieving collection info
      const collectionInfo = await qdrantClient.getCollection(TEST_COLLECTION_NAME);

      // Then: Collection should exist with correct configuration
      expect(collectionInfo).toBeDefined();
      expect(collectionInfo.status).toBe('green');

      // Verify vector configuration
      const denseConfig = collectionInfo.config?.params?.vectors as any;
      expect(denseConfig.dense).toBeDefined();
      expect(denseConfig.dense.size).toBe(768); // Jina-v3 dimensions
      expect(denseConfig.dense.distance).toBe('Cosine');

      // Verify HNSW configuration
      const hnswConfig = denseConfig.dense.hnsw_config;
      expect(hnswConfig).toBeDefined();
      expect(hnswConfig.m).toBe(16);
      expect(hnswConfig.ef_construct).toBe(100);

      // Verify sparse vector configuration
      const sparseVectors = collectionInfo.config?.params?.sparse_vectors as any;
      expect(sparseVectors?.sparse).toBeDefined();

      console.log('✓ Collection has correct HNSW configuration');
    });

    it('should have payload indexes for filtering', async () => {
      // When: Retrieving collection info
      const collectionInfo = await qdrantClient.getCollection(TEST_COLLECTION_NAME);

      // Then: Should have indexes on course_id and organization_id
      const payloadSchema = collectionInfo.payload_schema || {};

      // Check if indexes exist (they may be under different paths depending on Qdrant version)
      const hasIndexes = Object.keys(payloadSchema).length > 0;
      expect(hasIndexes).toBe(true);

      console.log('✓ Payload indexes created for filtering');
    });
  });

  // ==========================================================================
  // Scenario 2: Test Vectors Uploaded Successfully
  // ==========================================================================

  describe.skipIf(!qdrantAvailable)('Scenario 2: Test vectors uploaded successfully', () => {
    beforeEach(async () => {
      // Clean up test data before each test
      await deleteChunksByCourseId(TEST_COURSE_1, TEST_COLLECTION_NAME);
      await deleteChunksByCourseId(TEST_COURSE_2, TEST_COLLECTION_NAME);
    });

    it('should upload vectors in batches', async () => {
      // Given: Multiple test embeddings
      const embeddings: EmbeddingResult[] = [];
      for (let i = 0; i < 10; i++) {
        embeddings.push(
          createTestEmbedding(i, {
            content: `Test chunk ${i} with unique content for semantic search`,
            chunk_index: i,
          })
        );
      }

      // When: Uploading to Qdrant
      const uploadResult = await uploadChunksToQdrant(embeddings, {
        collection_name: TEST_COLLECTION_NAME,
        batch_size: 5,
        enable_sparse: false, // Disable sparse for faster tests
      });

      // Then: Upload should succeed
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.points_uploaded).toBe(10);
      expect(uploadResult.batch_count).toBe(2); // 10 vectors / batch size 5

      // Verify vectors are in collection
      const collectionInfo = await qdrantClient.getCollection(TEST_COLLECTION_NAME);
      expect(collectionInfo.points_count).toBeGreaterThanOrEqual(10);

      console.log(`✓ Uploaded ${uploadResult.points_uploaded} vectors in ${uploadResult.batch_count} batches`);
      console.log(`✓ Duration: ${uploadResult.duration_ms}ms`);
    });

    it('should handle empty upload gracefully', async () => {
      // Given: Empty embeddings array
      const embeddings: EmbeddingResult[] = [];

      // When: Uploading to Qdrant
      const uploadResult = await uploadChunksToQdrant(embeddings, {
        collection_name: TEST_COLLECTION_NAME,
      });

      // Then: Should return success with 0 points
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.points_uploaded).toBe(0);
      expect(uploadResult.batch_count).toBe(0);

      console.log('✓ Empty upload handled gracefully');
    });

    it('should store complete metadata with vectors', async () => {
      // Given: Embedding with comprehensive metadata
      const testChunk = createTestChunk({
        content: 'Test chunk with metadata',
        heading_path: 'Chapter 1 > Section 1.1',
        chapter: 'Chapter 1',
        section: 'Section 1.1',
        has_code: true,
        has_formulas: true,
        page_number: 42,
        page_range: [42, 43],
      });

      const embedding = createTestEmbedding(1, testChunk);

      // When: Uploading to Qdrant
      await uploadChunksToQdrant([embedding], {
        collection_name: TEST_COLLECTION_NAME,
      });

      // Then: Retrieve and verify metadata
      const points = await qdrantClient.scroll(TEST_COLLECTION_NAME, {
        filter: {
          must: [{ key: 'chunk_id', match: { value: testChunk.chunk_id } }],
        },
        limit: 1,
        with_payload: true,
      });

      expect(points.points).toHaveLength(1);
      const payload = points.points[0].payload;

      expect(payload?.content).toBe('Test chunk with metadata');
      expect(payload?.heading_path).toBe('Chapter 1 > Section 1.1');
      expect(payload?.chapter).toBe('Chapter 1');
      expect(payload?.section).toBe('Section 1.1');
      expect(payload?.has_code).toBe(true);
      expect(payload?.has_formulas).toBe(true);
      expect(payload?.page_number).toBe(42);
      expect(payload?.course_id).toBe(TEST_COURSE_1);
      expect(payload?.organization_id).toBe(TEST_ORG_1);

      console.log('✓ Complete metadata stored with vectors');
    });
  });

  // ==========================================================================
  // Scenario 3: Semantic Search with <30ms P95 Latency
  // ==========================================================================

  describe.skipIf(!qdrantAvailable)('Scenario 3: Semantic search returns top-K results with <30ms p95 latency', () => {
    beforeAll(async () => {
      // Upload test vectors for search tests
      const embeddings: EmbeddingResult[] = [];

      // Create vectors with different content
      const contents = [
        'Machine learning is a subset of artificial intelligence',
        'Deep learning uses neural networks with multiple layers',
        'Natural language processing enables computers to understand text',
        'Computer vision helps machines interpret visual information',
        'Reinforcement learning trains agents through rewards',
      ];

      for (let i = 0; i < contents.length; i++) {
        embeddings.push(
          createTestEmbedding(i * 100, {
            content: contents[i],
            chunk_index: i,
          })
        );
      }

      await uploadChunksToQdrant(embeddings, {
        collection_name: TEST_COLLECTION_NAME,
        enable_sparse: false,
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 30000);

    afterAll(async () => {
      await deleteChunksByCourseId(TEST_COURSE_1, TEST_COLLECTION_NAME);
    });

    it('should return top-K results for semantic query', async () => {
      // Given: Query vector similar to first test vector
      const queryVector = generateTestVector(0);

      // When: Performing search
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        limit: 3,
        with_payload: true,
      });

      // Then: Should return top-K results
      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.length).toBeLessThanOrEqual(3);

      // Verify results are sorted by score (descending)
      for (let i = 1; i < searchResults.length; i++) {
        expect(searchResults[i - 1].score).toBeGreaterThanOrEqual(searchResults[i].score);
      }

      console.log(`✓ Returned ${searchResults.length} top results`);
      console.log(`✓ Top score: ${searchResults[0].score.toFixed(4)}`);
    });

    it('should meet <30ms p95 latency requirement', async () => {
      // Given: Multiple search queries for latency measurement
      const queryVector = generateTestVector(0);
      const measurements: number[] = [];
      const numQueries = 20; // Run 20 queries for p95 calculation

      // When: Performing multiple searches
      for (let i = 0; i < numQueries; i++) {
        const startTime = performance.now();

        await qdrantClient.search(TEST_COLLECTION_NAME, {
          vector: {
            name: 'dense',
            vector: queryVector,
          },
          limit: 10,
          with_payload: false, // Faster without payload
        });

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      // Then: P95 latency should be under 30ms
      const p95Latency = calculateP95(measurements);
      const avgLatency = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const minLatency = Math.min(...measurements);
      const maxLatency = Math.max(...measurements);

      console.log(`✓ Search latency statistics (${numQueries} queries):`);
      console.log(`  - P95: ${p95Latency.toFixed(2)}ms`);
      console.log(`  - Avg: ${avgLatency.toFixed(2)}ms`);
      console.log(`  - Min: ${minLatency.toFixed(2)}ms`);
      console.log(`  - Max: ${maxLatency.toFixed(2)}ms`);

      expect(p95Latency).toBeLessThan(P95_LATENCY_MS);
    });

    it('should apply score threshold filtering', async () => {
      // Given: Query with high score threshold
      const queryVector = generateTestVector(0);

      // When: Performing search with threshold
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        limit: 10,
        score_threshold: 0.9, // High threshold
        with_payload: true,
      });

      // Then: All results should meet threshold
      for (const result of searchResults) {
        expect(result.score).toBeGreaterThanOrEqual(0.9);
      }

      console.log(`✓ Score threshold filtering applied (${searchResults.length} results above 0.9)`);
    });
  });

  // ==========================================================================
  // Scenario 4: Course-based Filtering
  // ==========================================================================

  describe.skipIf(!qdrantAvailable)('Scenario 4: Search with course_id filter returns only vectors for specified course', () => {
    beforeAll(async () => {
      // Upload vectors for two different courses
      const course1Embeddings: EmbeddingResult[] = [];
      const course2Embeddings: EmbeddingResult[] = [];

      for (let i = 0; i < 5; i++) {
        course1Embeddings.push(
          createTestEmbedding(i, {
            content: `Course 1 content chunk ${i}`,
            course_id: TEST_COURSE_1,
            organization_id: TEST_ORG_1,
          })
        );

        course2Embeddings.push(
          createTestEmbedding(i + 100, {
            content: `Course 2 content chunk ${i}`,
            course_id: TEST_COURSE_2,
            organization_id: TEST_ORG_1,
          })
        );
      }

      await uploadChunksToQdrant([...course1Embeddings, ...course2Embeddings], {
        collection_name: TEST_COLLECTION_NAME,
        enable_sparse: false,
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 30000);

    afterAll(async () => {
      await deleteChunksByCourseId(TEST_COURSE_1, TEST_COLLECTION_NAME);
      await deleteChunksByCourseId(TEST_COURSE_2, TEST_COLLECTION_NAME);
    });

    it('should filter results by course_id', async () => {
      // Given: Query vector
      const queryVector = generateTestVector(0);

      // When: Searching with course_id filter
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'course_id', match: { value: TEST_COURSE_1 } }],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: All results should be from TEST_COURSE_1
      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThan(0);

      for (const result of searchResults) {
        expect(result.payload?.course_id).toBe(TEST_COURSE_1);
      }

      console.log(`✓ Course filter applied: ${searchResults.length} results from course ${TEST_COURSE_1}`);
    });

    it('should return different results for different courses', async () => {
      // Given: Query vector
      const queryVector = generateTestVector(0);

      // When: Searching both courses
      const course1Results = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'course_id', match: { value: TEST_COURSE_1 } }],
        },
        limit: 10,
        with_payload: true,
      });

      const course2Results = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'course_id', match: { value: TEST_COURSE_2 } }],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: Results should be from different courses
      expect(course1Results.length).toBeGreaterThan(0);
      expect(course2Results.length).toBeGreaterThan(0);

      const course1ChunkIds = new Set(course1Results.map(r => r.payload?.chunk_id));
      const course2ChunkIds = new Set(course2Results.map(r => r.payload?.chunk_id));

      // No overlap between courses
      const course1Array = Array.from(course1ChunkIds);
      const intersection = course1Array.filter(id => course2ChunkIds.has(id));
      expect(intersection).toHaveLength(0);

      console.log(`✓ Course 1: ${course1Results.length} results, Course 2: ${course2Results.length} results`);
      console.log('✓ No overlap between courses');
    });

    it('should return no results for non-existent course', async () => {
      // Given: Query vector and non-existent course ID
      const queryVector = generateTestVector(0);
      const nonExistentCourse = '99999999-9999-9999-9999-999999999999';

      // When: Searching with non-existent course filter
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'course_id', match: { value: nonExistentCourse } }],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: Should return no results
      expect(searchResults).toHaveLength(0);

      console.log('✓ No results for non-existent course');
    });
  });

  // ==========================================================================
  // Scenario 5: Multi-tenant Isolation
  // ==========================================================================

  describe.skipIf(!qdrantAvailable)('Scenario 5: Multi-tenant isolation works (organization_id filtering)', () => {
    beforeAll(async () => {
      // Upload vectors for two different organizations
      const org1Embeddings: EmbeddingResult[] = [];
      const org2Embeddings: EmbeddingResult[] = [];

      for (let i = 0; i < 5; i++) {
        org1Embeddings.push(
          createTestEmbedding(i, {
            content: `Organization 1 content chunk ${i}`,
            course_id: TEST_COURSE_1,
            organization_id: TEST_ORG_1,
          })
        );

        org2Embeddings.push(
          createTestEmbedding(i + 200, {
            content: `Organization 2 content chunk ${i}`,
            course_id: TEST_COURSE_2,
            organization_id: TEST_ORG_2,
          })
        );
      }

      await uploadChunksToQdrant([...org1Embeddings, ...org2Embeddings], {
        collection_name: TEST_COLLECTION_NAME,
        enable_sparse: false,
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 30000);

    afterAll(async () => {
      // Clean up by deleting points with filters
      await qdrantClient.delete(TEST_COLLECTION_NAME, {
        filter: {
          must: [{ key: 'organization_id', match: { value: TEST_ORG_1 } }],
        },
        wait: true,
      });

      await qdrantClient.delete(TEST_COLLECTION_NAME, {
        filter: {
          must: [{ key: 'organization_id', match: { value: TEST_ORG_2 } }],
        },
        wait: true,
      });
    });

    it('should enforce organization isolation in search', async () => {
      // Given: Query vector
      const queryVector = generateTestVector(0);

      // When: Searching with organization_id filter
      const org1Results = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'organization_id', match: { value: TEST_ORG_1 } }],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: All results should be from TEST_ORG_1
      expect(org1Results).toBeDefined();
      expect(org1Results.length).toBeGreaterThan(0);

      for (const result of org1Results) {
        expect(result.payload?.organization_id).toBe(TEST_ORG_1);
      }

      console.log(`✓ Organization filter enforced: ${org1Results.length} results from org ${TEST_ORG_1}`);
    });

    it('should prevent cross-organization data leakage', async () => {
      // Given: Query vector
      const queryVector = generateTestVector(0);

      // When: Searching both organizations
      const org1Results = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'organization_id', match: { value: TEST_ORG_1 } }],
        },
        limit: 10,
        with_payload: true,
      });

      const org2Results = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [{ key: 'organization_id', match: { value: TEST_ORG_2 } }],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: Results should be completely isolated
      expect(org1Results.length).toBeGreaterThan(0);
      expect(org2Results.length).toBeGreaterThan(0);

      const org1ChunkIds = new Set(org1Results.map(r => r.payload?.chunk_id));
      const org2ChunkIds = new Set(org2Results.map(r => r.payload?.chunk_id));

      // No overlap between organizations
      const org1Array = Array.from(org1ChunkIds);
      const intersection = org1Array.filter(id => org2ChunkIds.has(id));
      expect(intersection).toHaveLength(0);

      console.log(`✓ Org 1: ${org1Results.length} results, Org 2: ${org2Results.length} results`);
      console.log('✓ Complete isolation between organizations - no data leakage');
    });

    it('should support combined organization and course filtering', async () => {
      // Given: Query vector
      const queryVector = generateTestVector(0);

      // When: Searching with both organization_id and course_id filters
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [
            { key: 'organization_id', match: { value: TEST_ORG_1 } },
            { key: 'course_id', match: { value: TEST_COURSE_1 } },
          ],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: All results should match both filters
      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThan(0);

      for (const result of searchResults) {
        expect(result.payload?.organization_id).toBe(TEST_ORG_1);
        expect(result.payload?.course_id).toBe(TEST_COURSE_1);
      }

      console.log(`✓ Combined filters applied: ${searchResults.length} results matching both org and course`);
    });

    it('should return no results when filtering by wrong organization', async () => {
      // Given: Query vector and course from ORG_1
      const queryVector = generateTestVector(0);

      // When: Searching with ORG_2 filter for ORG_1 course
      const searchResults = await qdrantClient.search(TEST_COLLECTION_NAME, {
        vector: {
          name: 'dense',
          vector: queryVector,
        },
        filter: {
          must: [
            { key: 'organization_id', match: { value: TEST_ORG_2 } },
            { key: 'course_id', match: { value: TEST_COURSE_1 } }, // Course belongs to ORG_1
          ],
        },
        limit: 10,
        with_payload: true,
      });

      // Then: Should return no results (course doesn't belong to ORG_2)
      expect(searchResults).toHaveLength(0);

      console.log('✓ No cross-organization access - empty results for mismatched org/course');
    });
  });
});
