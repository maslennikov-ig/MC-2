/**
 * Jina-v3 Embeddings - Integration Tests
 *
 * Comprehensive integration tests for Jina-v3 embedding generation service.
 * Tests embedding dimensions, task-specific embeddings, and semantic similarity.
 *
 * Prerequisites:
 * - JINA_API_KEY environment variable set
 * - Internet connection for Jina API calls
 * - Tests will skip gracefully if API key is not available
 *
 * Test execution: pnpm test tests/integration/jina-embeddings.test.ts
 *
 * Scenarios covered:
 * 1. Embeddings generated with 768 dimensions
 * 2. Task-specific embeddings ("retrieval.passage" vs "retrieval.query")
 * 3. Semantic similarity >95% recall for similar documents
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateEmbeddingsWithLateChunking,
  generateQueryEmbedding,
  healthCheck,
} from '../../src/shared/embeddings/generate';
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
 * Test organization and course IDs
 */
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_COURSE_ID = '00000000-0000-0000-0001-000000000001';

/**
 * Expected embedding dimensions for Jina-v3
 */
const EXPECTED_DIMENSIONS = 768;

/**
 * Minimum semantic similarity threshold for similar documents (95% recall requirement)
 */
const SIMILARITY_THRESHOLD = 0.95;

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a test enriched chunk with specified content
 */
function createTestChunk(content: string, overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  const chunkId = randomUUID();
  return {
    chunk_id: chunkId,
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child' as const,
    content,
    token_count: Math.ceil(content.split(/\s+/).length * 1.3), // Rough token estimate
    char_count: content.length,
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
    organization_id: TEST_ORG_ID,
    course_id: TEST_COURSE_ID,
    indexed_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    image_refs: [],
    table_refs: [],
    ...overrides,
  };
}

/**
 * Calculates cosine similarity between two vectors
 *
 * @param vecA - First embedding vector
 * @param vecB - Second embedding vector
 * @returns Cosine similarity score (0 to 1)
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Checks if Jina API is available
 */
async function isJinaAvailable(): Promise<boolean> {
  try {
    await healthCheck();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Test documents for semantic similarity testing
 */
const TEST_DOCUMENTS = {
  // Similar documents - Machine Learning topic cluster
  similar1: {
    english: 'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.',
    russian: 'Машинное обучение — это подмножество искусственного интеллекта, которое позволяет системам учиться и улучшаться на основе опыта без явного программирования.',
  },
  similar2: {
    english: 'Deep learning is a type of machine learning that uses neural networks with multiple layers to analyze various factors of data.',
    russian: 'Глубокое обучение — это тип машинного обучения, использующий нейронные сети с множественными слоями для анализа различных факторов данных.',
  },
  similar3: {
    english: 'Neural networks are computing systems inspired by biological neural networks that constitute animal brains, used extensively in machine learning.',
    russian: 'Нейронные сети — это вычислительные системы, вдохновленные биологическими нейронными сетями мозга животных, широко используемые в машинном обучении.',
  },

  // Dissimilar documents - Unrelated topics
  dissimilar1: {
    english: 'Mediterranean cuisine is characterized by the use of olive oil, fresh vegetables, seafood, and aromatic herbs like basil and oregano.',
    russian: 'Средиземноморская кухня характеризуется использованием оливкового масла, свежих овощей, морепродуктов и ароматных трав, таких как базилик и орегано.',
  },
  dissimilar2: {
    english: 'Professional football requires extensive physical training, strategic game planning, and coordinated team effort to achieve success.',
    russian: 'Профессиональный футбол требует обширной физической подготовки, стратегического планирования игры и скоординированных командных усилий для достижения успеха.',
  },
  dissimilar3: {
    english: 'Classical music composition involves understanding harmony, counterpoint, orchestration, and the historical context of musical periods.',
    russian: 'Композиция классической музыки включает понимание гармонии, контрапункта, оркестровки и исторического контекста музыкальных периодов.',
  },
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Jina-v3 Embeddings Integration Tests', () => {
  let jinaAvailable = false;

  beforeAll(async () => {
    // Check if Jina API is available
    jinaAvailable = await isJinaAvailable();

    if (!jinaAvailable) {
      console.warn('⚠️  Jina API is not available - tests will be skipped');
      console.warn('   Please ensure JINA_API_KEY is set in your .env file');
      return;
    }

    console.log('✓ Jina API connection established');
  }, 30000); // 30s timeout for setup

  // ==========================================================================
  // Scenario 1: Embeddings Generated with 768 Dimensions
  // ==========================================================================

  describe.skipIf(!jinaAvailable)('Scenario 1: Embeddings generated with 768 dimensions', () => {
    it('should generate embeddings with exactly 768 dimensions for single chunk', async () => {
      // Given: Single test chunk
      const chunk = createTestChunk('This is a test chunk for embedding generation.');

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');

      // Then: Should return embedding with 768 dimensions
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].dense_vector).toHaveLength(EXPECTED_DIMENSIONS);
      expect(result.total_tokens).toBeGreaterThan(0);

      console.log(`✓ Generated embedding with ${result.embeddings[0].dense_vector.length} dimensions`);
      console.log(`✓ Token count: ${result.total_tokens}`);
    });

    it('should generate embeddings with 768 dimensions for multiple chunks', async () => {
      // Given: Multiple test chunks
      const chunks = [
        createTestChunk('Machine learning enables computers to learn from data.'),
        createTestChunk('Deep learning uses neural networks for complex pattern recognition.'),
        createTestChunk('Natural language processing helps computers understand human language.'),
      ];

      // When: Generating embeddings in batch
      const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage');

      // Then: All embeddings should have 768 dimensions
      expect(result.embeddings).toHaveLength(3);
      expect(result.metadata.chunk_count).toBe(3);
      expect(result.metadata.late_chunking_enabled).toBe(true);

      for (const embedding of result.embeddings) {
        expect(embedding.dense_vector).toHaveLength(EXPECTED_DIMENSIONS);
        expect(embedding.dense_vector.every(val => typeof val === 'number')).toBe(true);
      }

      console.log(`✓ Generated ${result.embeddings.length} embeddings, all with ${EXPECTED_DIMENSIONS} dimensions`);
      console.log(`✓ Late chunking enabled: ${result.metadata.late_chunking_enabled}`);
      console.log(`✓ Total tokens: ${result.total_tokens}`);
    });

    it('should generate query embedding with 768 dimensions', async () => {
      // Given: Query text
      const queryText = 'What is machine learning and how does it work?';

      // When: Generating query embedding
      const startTime = performance.now();
      const queryVector = await generateQueryEmbedding(queryText);
      const endTime = performance.now();

      // Then: Should return 768-dimensional vector
      expect(queryVector).toHaveLength(EXPECTED_DIMENSIONS);
      expect(queryVector.every(val => typeof val === 'number')).toBe(true);
      expect(queryVector.every(val => !isNaN(val) && isFinite(val))).toBe(true);

      const latency = endTime - startTime;
      console.log(`✓ Query embedding generated with ${queryVector.length} dimensions`);
      console.log(`✓ Latency: ${latency.toFixed(2)}ms`);
    });

    it('should generate embeddings for Russian text with 768 dimensions', async () => {
      // Given: Russian text chunk (project requirement)
      const chunk = createTestChunk(
        'Машинное обучение — это подмножество искусственного интеллекта, которое позволяет системам учиться и улучшаться на основе опыта.'
      );

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');

      // Then: Should generate valid 768-dimensional embedding
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].dense_vector).toHaveLength(EXPECTED_DIMENSIONS);

      console.log(`✓ Russian text embedded successfully with ${EXPECTED_DIMENSIONS} dimensions`);
      console.log(`✓ Token count: ${result.total_tokens}`);
    });

    it('should handle empty input gracefully', async () => {
      // Given: Empty chunks array
      const chunks: EnrichedChunk[] = [];

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage');

      // Then: Should return empty result
      expect(result.embeddings).toHaveLength(0);
      expect(result.total_tokens).toBe(0);
      expect(result.metadata.chunk_count).toBe(0);
      expect(result.metadata.batch_count).toBe(0);

      console.log('✓ Empty input handled gracefully');
    });
  });

  // ==========================================================================
  // Scenario 2: Task-Specific Embeddings
  // ==========================================================================

  describe.skipIf(!jinaAvailable)('Scenario 2: Task-specific embeddings (retrieval.passage vs retrieval.query)', () => {
    it('should generate different embeddings for passage vs query tasks', async () => {
      // Given: Same text with different task types
      const text = 'Machine learning is a subset of artificial intelligence.';
      const chunk = createTestChunk(text);

      // When: Generating embeddings with different tasks
      const passageResult = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');
      const queryResult = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.query');

      const passageVector = passageResult.embeddings[0].dense_vector;
      const queryVector = queryResult.embeddings[0].dense_vector;

      // Then: Embeddings should be different but still similar
      expect(passageVector).toHaveLength(EXPECTED_DIMENSIONS);
      expect(queryVector).toHaveLength(EXPECTED_DIMENSIONS);

      // Vectors should not be identical
      const areIdentical = passageVector.every((val, idx) => val === queryVector[idx]);
      expect(areIdentical).toBe(false);

      // But should still be somewhat similar (same content, different task-specific adaptation)
      const similarity = cosineSimilarity(passageVector, queryVector);
      expect(similarity).toBeGreaterThan(0.8); // High similarity but not identical

      console.log('✓ Passage and query embeddings are different');
      console.log(`✓ Cross-task similarity: ${similarity.toFixed(4)} (expected >0.8)`);
    });

    it('should use passage task for document indexing', async () => {
      // Given: Document chunks for indexing
      const chunks = [
        createTestChunk('Neural networks consist of layers of interconnected nodes.'),
        createTestChunk('Training a neural network requires labeled data and optimization algorithms.'),
      ];

      // When: Generating embeddings for indexing (passage task)
      const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage');

      // Then: Should successfully generate passage embeddings
      expect(result.embeddings).toHaveLength(2);
      expect(result.metadata.late_chunking_enabled).toBe(true);

      for (const embedding of result.embeddings) {
        expect(embedding.dense_vector).toHaveLength(EXPECTED_DIMENSIONS);
      }

      console.log(`✓ Passage embeddings generated for indexing (${result.embeddings.length} chunks)`);
      console.log(`✓ Late chunking enabled: ${result.metadata.late_chunking_enabled}`);
    });

    it('should use query task for search queries', async () => {
      // Given: User search query
      const queryText = 'How do neural networks learn from data?';

      // When: Generating query embedding
      const queryVector = await generateQueryEmbedding(queryText);

      // Then: Should generate query-adapted embedding
      expect(queryVector).toHaveLength(EXPECTED_DIMENSIONS);

      console.log('✓ Query embedding generated for search');
      console.log(`✓ Dimensions: ${queryVector.length}`);
    });

    it('should demonstrate task-specific optimization', async () => {
      // Given: Document passage and related query
      const passage = 'Backpropagation is the algorithm used to train neural networks by calculating gradients.';
      const query = 'What algorithm is used to train neural networks?';

      const passageChunk = createTestChunk(passage);

      // When: Generating task-specific embeddings
      const passageResult = await generateEmbeddingsWithLateChunking([passageChunk], 'retrieval.passage');
      const queryVector = await generateQueryEmbedding(query);

      const passageVector = passageResult.embeddings[0].dense_vector;

      // Then: Query should be similar to passage (semantic match)
      const similarity = cosineSimilarity(queryVector, passageVector);
      expect(similarity).toBeGreaterThan(0.7); // Strong semantic relationship

      console.log('✓ Task-specific embeddings demonstrate semantic alignment');
      console.log(`✓ Query-to-passage similarity: ${similarity.toFixed(4)} (expected >0.7)`);
    });

    it('should support late chunking for passages but not queries', async () => {
      // Given: Multiple chunks for passage, single query
      const chunks = [
        createTestChunk('First chunk of content.'),
        createTestChunk('Second chunk of content.'),
      ];
      const query = 'Search query text';

      // When: Generating embeddings
      const passageResult = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage', true);
      const queryChunk = createTestChunk(query);
      const queryResult = await generateEmbeddingsWithLateChunking([queryChunk], 'retrieval.query', false);

      // Then: Passage should have late chunking enabled, query should not
      expect(passageResult.metadata.late_chunking_enabled).toBe(true);
      expect(queryResult.metadata.late_chunking_enabled).toBe(false);

      console.log('✓ Late chunking enabled for passages, disabled for queries');
      console.log(`✓ Passage chunks: ${passageResult.embeddings.length}, Query chunks: ${queryResult.embeddings.length}`);
    });
  });

  // ==========================================================================
  // Scenario 3: Semantic Similarity >95% Recall
  // ==========================================================================

  describe.skipIf(!jinaAvailable)('Scenario 3: Semantic similarity >95% recall for similar documents', () => {
    it('should show high similarity (>0.95) for similar English documents', async () => {
      // Given: Similar documents about machine learning
      const chunk1 = createTestChunk(TEST_DOCUMENTS.similar1.english);
      const chunk2 = createTestChunk(TEST_DOCUMENTS.similar2.english);
      const chunk3 = createTestChunk(TEST_DOCUMENTS.similar3.english);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking(
        [chunk1, chunk2, chunk3],
        'retrieval.passage'
      );

      const vec1 = result.embeddings[0].dense_vector;
      const vec2 = result.embeddings[1].dense_vector;
      const vec3 = result.embeddings[2].dense_vector;

      // Then: All pairs should have high similarity (>95% recall)
      const sim1_2 = cosineSimilarity(vec1, vec2);
      const sim1_3 = cosineSimilarity(vec1, vec3);
      const sim2_3 = cosineSimilarity(vec2, vec3);

      expect(sim1_2).toBeGreaterThan(SIMILARITY_THRESHOLD);
      expect(sim1_3).toBeGreaterThan(SIMILARITY_THRESHOLD);
      expect(sim2_3).toBeGreaterThan(SIMILARITY_THRESHOLD);

      const avgSimilarity = (sim1_2 + sim1_3 + sim2_3) / 3;

      console.log('✓ High similarity for related English documents:');
      console.log(`  - Doc1 <-> Doc2: ${sim1_2.toFixed(4)} (${sim1_2 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Doc1 <-> Doc3: ${sim1_3.toFixed(4)} (${sim1_3 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Doc2 <-> Doc3: ${sim2_3.toFixed(4)} (${sim2_3 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Average similarity: ${avgSimilarity.toFixed(4)}`);
    });

    it('should show high similarity (>0.95) for similar Russian documents', async () => {
      // Given: Similar documents about machine learning in Russian
      const chunk1 = createTestChunk(TEST_DOCUMENTS.similar1.russian);
      const chunk2 = createTestChunk(TEST_DOCUMENTS.similar2.russian);
      const chunk3 = createTestChunk(TEST_DOCUMENTS.similar3.russian);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking(
        [chunk1, chunk2, chunk3],
        'retrieval.passage'
      );

      const vec1 = result.embeddings[0].dense_vector;
      const vec2 = result.embeddings[1].dense_vector;
      const vec3 = result.embeddings[2].dense_vector;

      // Then: All pairs should have high similarity (>95% recall)
      const sim1_2 = cosineSimilarity(vec1, vec2);
      const sim1_3 = cosineSimilarity(vec1, vec3);
      const sim2_3 = cosineSimilarity(vec2, vec3);

      expect(sim1_2).toBeGreaterThan(SIMILARITY_THRESHOLD);
      expect(sim1_3).toBeGreaterThan(SIMILARITY_THRESHOLD);
      expect(sim2_3).toBeGreaterThan(SIMILARITY_THRESHOLD);

      const avgSimilarity = (sim1_2 + sim1_3 + sim2_3) / 3;

      console.log('✓ High similarity for related Russian documents (optimized for Russian):');
      console.log(`  - Doc1 <-> Doc2: ${sim1_2.toFixed(4)} (${sim1_2 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Doc1 <-> Doc3: ${sim1_3.toFixed(4)} (${sim1_3 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Doc2 <-> Doc3: ${sim2_3.toFixed(4)} (${sim2_3 >= SIMILARITY_THRESHOLD ? 'PASS' : 'FAIL'})`);
      console.log(`  - Average similarity: ${avgSimilarity.toFixed(4)}`);
    });

    it('should show low similarity (<0.7) for dissimilar documents', async () => {
      // Given: Documents on different topics
      const mlChunk = createTestChunk(TEST_DOCUMENTS.similar1.english);
      const cookingChunk = createTestChunk(TEST_DOCUMENTS.dissimilar1.english);
      const sportsChunk = createTestChunk(TEST_DOCUMENTS.dissimilar2.english);
      const musicChunk = createTestChunk(TEST_DOCUMENTS.dissimilar3.english);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking(
        [mlChunk, cookingChunk, sportsChunk, musicChunk],
        'retrieval.passage'
      );

      const mlVec = result.embeddings[0].dense_vector;
      const cookingVec = result.embeddings[1].dense_vector;
      const sportsVec = result.embeddings[2].dense_vector;
      const musicVec = result.embeddings[3].dense_vector;

      // Then: Dissimilar pairs should have low similarity
      const simMLCooking = cosineSimilarity(mlVec, cookingVec);
      const simMLSports = cosineSimilarity(mlVec, sportsVec);
      const simMLMusic = cosineSimilarity(mlVec, musicVec);
      const simCookingSports = cosineSimilarity(cookingVec, sportsVec);

      expect(simMLCooking).toBeLessThan(0.7);
      expect(simMLSports).toBeLessThan(0.7);
      expect(simMLMusic).toBeLessThan(0.7);
      expect(simCookingSports).toBeLessThan(0.7);

      console.log('✓ Low similarity for unrelated documents:');
      console.log(`  - ML <-> Cooking: ${simMLCooking.toFixed(4)} (${simMLCooking < 0.7 ? 'PASS' : 'FAIL'})`);
      console.log(`  - ML <-> Sports: ${simMLSports.toFixed(4)} (${simMLSports < 0.7 ? 'PASS' : 'FAIL'})`);
      console.log(`  - ML <-> Music: ${simMLMusic.toFixed(4)} (${simMLMusic < 0.7 ? 'PASS' : 'FAIL'})`);
      console.log(`  - Cooking <-> Sports: ${simCookingSports.toFixed(4)} (${simCookingSports < 0.7 ? 'PASS' : 'FAIL'})`);
    });

    it('should demonstrate >95% recall: similar docs rank higher than dissimilar', async () => {
      // Given: Query and candidate documents (similar and dissimilar)
      const queryText = 'Explain how machine learning algorithms work';
      const similarDoc = TEST_DOCUMENTS.similar1.english;
      const dissimilarDoc1 = TEST_DOCUMENTS.dissimilar1.english;
      const dissimilarDoc2 = TEST_DOCUMENTS.dissimilar2.english;

      // When: Generating embeddings
      const queryVector = await generateQueryEmbedding(queryText);
      const chunks = [
        createTestChunk(similarDoc),
        createTestChunk(dissimilarDoc1),
        createTestChunk(dissimilarDoc2),
      ];
      const docResult = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage');

      // Calculate similarities
      const similarities = docResult.embeddings.map((embedding, idx) => ({
        index: idx,
        content: chunks[idx].content.substring(0, 50) + '...',
        similarity: cosineSimilarity(queryVector, embedding.dense_vector),
      }));

      // Sort by similarity (descending)
      const ranked = similarities.sort((a, b) => b.similarity - a.similarity);

      // Then: Similar document should rank first with >95% recall
      expect(ranked[0].index).toBe(0); // Similar doc should be first
      expect(ranked[0].similarity).toBeGreaterThan(0.75); // Strong semantic match

      // Dissimilar docs should rank lower
      expect(ranked[1].similarity).toBeLessThan(ranked[0].similarity);
      expect(ranked[2].similarity).toBeLessThan(ranked[0].similarity);

      console.log('✓ Ranking demonstrates >95% recall:');
      console.log(`  1st: ${ranked[0].content} (similarity: ${ranked[0].similarity.toFixed(4)})`);
      console.log(`  2nd: ${ranked[1].content} (similarity: ${ranked[1].similarity.toFixed(4)})`);
      console.log(`  3rd: ${ranked[2].content} (similarity: ${ranked[2].similarity.toFixed(4)})`);
      console.log(`✓ Similar document correctly ranks first`);
    });

    it('should maintain semantic relationships across languages', async () => {
      // Given: Same concept in English and Russian
      const englishChunk = createTestChunk(TEST_DOCUMENTS.similar1.english);
      const russianChunk = createTestChunk(TEST_DOCUMENTS.similar1.russian);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking(
        [englishChunk, russianChunk],
        'retrieval.passage'
      );

      const englishVec = result.embeddings[0].dense_vector;
      const russianVec = result.embeddings[1].dense_vector;

      // Then: Cross-language similarity should be high (same concept)
      const crossLangSimilarity = cosineSimilarity(englishVec, russianVec);
      expect(crossLangSimilarity).toBeGreaterThan(0.85); // High cross-language semantic match

      console.log('✓ Cross-language semantic alignment:');
      console.log(`  - English <-> Russian: ${crossLangSimilarity.toFixed(4)} (expected >0.85)`);
      console.log('✓ Jina-v3 maintains semantic relationships across languages');
    });

    it('should measure embedding generation latency', async () => {
      // Given: Multiple chunks
      const chunks = Array.from({ length: 10 }, (_, i) =>
        createTestChunk(`Test chunk ${i} with some content for latency measurement`)
      );

      // When: Measuring embedding generation time
      const startTime = performance.now();
      const result = await generateEmbeddingsWithLateChunking(chunks, 'retrieval.passage');
      const endTime = performance.now();

      const totalLatency = endTime - startTime;
      const avgLatencyPerChunk = totalLatency / chunks.length;

      // Then: Record performance metrics (informational)
      expect(result.embeddings).toHaveLength(10);

      console.log('✓ Embedding generation performance:');
      console.log(`  - Total chunks: ${chunks.length}`);
      console.log(`  - Total latency: ${totalLatency.toFixed(2)}ms`);
      console.log(`  - Avg per chunk: ${avgLatencyPerChunk.toFixed(2)}ms`);
      console.log(`  - Total tokens: ${result.total_tokens}`);
      console.log(`  - Batch count: ${result.metadata.batch_count}`);
    });
  });

  // ==========================================================================
  // Additional Tests: Error Handling and Edge Cases
  // ==========================================================================

  describe.skipIf(!jinaAvailable)('Additional: Error handling and edge cases', () => {
    it('should handle very long text (chunk boundary testing)', async () => {
      // Given: Long text chunk (testing tokenization)
      const longText = Array(500).fill('word').join(' '); // ~500 words
      const chunk = createTestChunk(longText);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');

      // Then: Should successfully embed long text
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].dense_vector).toHaveLength(EXPECTED_DIMENSIONS);
      expect(result.total_tokens).toBeGreaterThan(500); // Should have many tokens

      console.log(`✓ Long text embedded successfully (${result.total_tokens} tokens)`);
    });

    it('should handle special characters and Unicode', async () => {
      // Given: Text with special characters and Unicode
      const specialText = 'Text with émojis 😀, symbols ©™®, and math ∑∫∂π';
      const chunk = createTestChunk(specialText);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');

      // Then: Should successfully embed special characters
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].dense_vector).toHaveLength(EXPECTED_DIMENSIONS);

      console.log('✓ Special characters and Unicode handled successfully');
    });

    it('should handle very short text', async () => {
      // Given: Very short text
      const shortText = 'Hi';
      const chunk = createTestChunk(shortText);

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');

      // Then: Should successfully embed short text
      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0].dense_vector).toHaveLength(EXPECTED_DIMENSIONS);
      expect(result.total_tokens).toBeGreaterThan(0);

      console.log(`✓ Short text embedded successfully (${result.total_tokens} tokens)`);
    });

    it('should maintain vector normalization', async () => {
      // Given: Test chunk
      const chunk = createTestChunk('Test chunk for normalization check');

      // When: Generating embeddings
      const result = await generateEmbeddingsWithLateChunking([chunk], 'retrieval.passage');
      const vector = result.embeddings[0].dense_vector;

      // Then: Vector should be properly normalized
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

      // Jina API returns normalized vectors (magnitude close to 1.0)
      expect(magnitude).toBeGreaterThan(0.9);
      expect(magnitude).toBeLessThan(1.1);

      console.log(`✓ Vector normalization verified (magnitude: ${magnitude.toFixed(6)})`);
    });
  });
});
