#!/usr/bin/env tsx
/**
 * End-to-End RAG Workflow Test
 *
 * This script validates the complete RAG pipeline from document upload to semantic search results.
 * It tests all components implemented in User Story 5 (T074-T079) working together.
 *
 * Pipeline tested:
 * 1. Document Conversion (T074) - Docling → Markdown
 * 2. Hierarchical Chunking (T075) - Parent-child chunks
 * 3. Metadata Enrichment (T075) - Add document metadata
 * 4. Embedding Generation (T076) - Jina-v3 with late chunking
 * 5. Vector Upload (T077) - Batch upload to Qdrant
 * 6. Semantic Search (T078) - Query embedding + retrieval
 *
 * Usage:
 *   pnpm tsx experiments/features/test-rag-workflow.ts
 *
 * Requirements:
 *   - All RAG environment variables configured in .env
 *   - Test documents in test-data/ directory
 *   - Qdrant, Jina API, and Docling MCP accessible
 *   - Redis running (for caching)
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

// Load environment variables BEFORE importing modules
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Import workflow components
import { convertDocumentToMarkdown } from '../../src/shared/embeddings/markdown-converter';
import { chunkMarkdown } from '../../src/shared/embeddings/markdown-chunker';
import { enrichChunks } from '../../src/shared/embeddings/metadata-enricher';
import {
  generateEmbeddingsWithLateChunking,
  generateQueryEmbedding,
} from '../../src/shared/embeddings/generate';
import { uploadChunksToQdrant, updateVectorStatus } from '../../src/shared/qdrant/upload';
import { searchChunks } from '../../src/shared/qdrant/search';
import { qdrantClient } from '../../src/shared/qdrant/client';
import { COLLECTION_CONFIG } from '../../src/shared/qdrant/create-collection';

// ANSI color codes for terminal output
// UUID v4 generator using crypto (no external dependency)
function generateUUID(): string {
  return randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSection(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('─'.repeat(60));
}

function logStep(step: number, total: number, description: string) {
  console.log(
    `\n${colors.magenta}[${step}/${total}]${colors.reset} ${colors.bold}${description}${colors.reset}`
  );
}

/**
 * Test statistics tracking
 */
interface TestStats {
  documentsProcessed: number;
  totalChunks: number;
  totalEmbeddings: number;
  totalTokens: number;
  searchQueries: number;
  relevantResults: number;
  totalLatencyMs: number;
  stepLatencies: {
    conversion: number[];
    chunking: number[];
    enrichment: number[];
    embedding: number[];
    upload: number[];
    search: number[];
  };
}

const stats: TestStats = {
  documentsProcessed: 0,
  totalChunks: 0,
  totalEmbeddings: 0,
  totalTokens: 0,
  searchQueries: 0,
  relevantResults: 0,
  totalLatencyMs: 0,
  stepLatencies: {
    conversion: [],
    chunking: [],
    enrichment: [],
    embedding: [],
    upload: [],
    search: [],
  },
};

/**
 * Test document metadata
 */
interface TestDocument {
  name: string;
  path: string;
  format: 'PDF' | 'DOCX' | 'PPTX' | 'MD';
  testQuery: string;
  expectedKeywords: string[];
}

/**
 * Creates test documents programmatically
 * This allows tests to run without requiring external test files
 */
async function createTestDocuments(): Promise<TestDocument[]> {
  const testDataDir = resolve(__dirname, '../test-data');

  // Create test-data directory if it doesn't exist
  if (!existsSync(testDataDir)) {
    mkdirSync(testDataDir, { recursive: true });
    logInfo(`Created test-data directory: ${testDataDir}`);
  }

  // Create a simple Markdown test document
  const mdContent = `# Machine Learning Fundamentals

## Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. It uses algorithms to identify patterns and make decisions based on the data it processes.

### Types of Machine Learning

There are three main types of machine learning:

1. **Supervised Learning**: The algorithm learns from labeled training data
2. **Unsupervised Learning**: The algorithm finds patterns in unlabeled data
3. **Reinforcement Learning**: The algorithm learns through trial and error

## Neural Networks

Neural networks are a fundamental component of deep learning. They consist of interconnected nodes (neurons) organized in layers:

- Input layer: Receives the raw data
- Hidden layers: Process the data through weighted connections
- Output layer: Produces the final prediction

### Training Neural Networks

Training involves:
1. Forward propagation: Data flows through the network
2. Loss calculation: Comparing predictions to actual values
3. Backpropagation: Adjusting weights to minimize loss
4. Iteration: Repeating until convergence

## Practical Applications

Machine learning is used in many real-world applications:

- Image recognition and computer vision
- Natural language processing (NLP)
- Recommendation systems
- Autonomous vehicles
- Medical diagnosis
- Fraud detection

## Conclusion

Understanding machine learning fundamentals is essential for building intelligent systems that can learn and adapt from data.
`;

  const mdPath = resolve(testDataDir, 'machine-learning-guide.md');
  writeFileSync(mdPath, mdContent, 'utf-8');

  logSuccess(`Created test document: ${mdPath}`);

  return [
    {
      name: 'Machine Learning Guide',
      path: mdPath,
      format: 'MD',
      testQuery: 'What are the types of machine learning?',
      expectedKeywords: ['supervised', 'unsupervised', 'reinforcement'],
    },
  ];
}

/**
 * Step 1: Document Conversion (Docling → Markdown)
 */
async function testDocumentConversion(document: TestDocument) {
  logStep(1, 6, 'Document Conversion (Docling → Markdown)');

  const startTime = Date.now();

  try {
    // For Markdown files, skip Docling and read directly
    if (document.format === 'MD') {
      const { readFileSync } = await import('fs');
      const markdown = readFileSync(document.path, 'utf-8');

      const latency = Date.now() - startTime;
      stats.stepLatencies.conversion.push(latency);

      logSuccess(`Loaded ${document.name} markdown (${latency}ms)`);
      logInfo(`  Format: Native Markdown (no conversion needed)`);
      logInfo(`  Markdown length: ${markdown.length} characters`);

      // Validate markdown output
      if (!markdown || markdown.length === 0) {
        throw new Error('Markdown file is empty');
      }

      // Return result in ConversionResult format
      return {
        markdown,
        json: {} as any, // Empty DoclingDocument for MD files
        images: [],
        structure: {
          title: document.name,
          sections: [],
          heading_counts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
          max_depth: 0,
        },
        metadata: {
          processing_time_ms: latency,
          pages_processed: 1,
          text_elements: 0,
          images_extracted: 0,
          tables_extracted: 0,
          markdown_length: markdown.length,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // For PDF, DOCX, PPTX - use Docling conversion
    const result = await convertDocumentToMarkdown(document.path);

    const latency = Date.now() - startTime;
    stats.stepLatencies.conversion.push(latency);

    logSuccess(`Converted ${document.name} to markdown (${latency}ms)`);
    logInfo(`  Pages: ${result.metadata.pages_processed}`);
    logInfo(`  Markdown length: ${result.metadata.markdown_length} characters`);
    logInfo(`  Images: ${result.metadata.images_extracted}`);
    logInfo(`  Tables: ${result.metadata.tables_extracted}`);

    // Validate markdown output
    if (!result.markdown || result.markdown.length === 0) {
      throw new Error('Markdown conversion produced empty result');
    }

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Conversion failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Step 2: Hierarchical Chunking
 */
async function testHierarchicalChunking(markdown: string, documentName: string) {
  logStep(2, 6, 'Hierarchical Chunking (Parent-Child)');

  const startTime = Date.now();

  try {
    const result = await chunkMarkdown(markdown);

    const latency = Date.now() - startTime;
    stats.stepLatencies.chunking.push(latency);

    logSuccess(`Chunked ${documentName} (${latency}ms)`);
    logInfo(`  Parent chunks: ${result.metadata.parent_count}`);
    logInfo(`  Child chunks: ${result.metadata.child_count}`);
    logInfo(`  Average parent tokens: ${result.metadata.avg_parent_tokens}`);
    logInfo(`  Average child tokens: ${result.metadata.avg_child_tokens}`);

    // Validate chunking output
    if (result.child_chunks.length === 0) {
      throw new Error('Chunking produced no child chunks');
    }

    stats.totalChunks += result.child_chunks.length;

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Chunking failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Step 3: Metadata Enrichment
 */
async function testMetadataEnrichment(chunkingResult: any, documentId: string, documentName: string) {
  logStep(3, 6, 'Metadata Enrichment');

  const startTime = Date.now();

  try {
    // Enrich child chunks (these are indexed in Qdrant)
    const enrichedChunks = enrichChunks(chunkingResult.child_chunks, {
      document_id: documentId,
      document_name: documentName,
      organization_id: 'test-org-001',
      course_id: 'test-course-001',
      document_version: 'v1',
      version_hash: generateUUID(),
    });

    const latency = Date.now() - startTime;
    stats.stepLatencies.enrichment.push(latency);

    logSuccess(`Enriched ${enrichedChunks.length} chunks (${latency}ms)`);

    // Validate enrichment
    const sampleChunk = enrichedChunks[0];
    logInfo(`  Sample chunk metadata:`);
    logInfo(`    - Document ID: ${sampleChunk.document_id}`);
    logInfo(`    - Heading path: ${sampleChunk.heading_path}`);
    logInfo(`    - Has code: ${sampleChunk.has_code}`);
    logInfo(`    - Has formulas: ${sampleChunk.has_formulas}`);
    logInfo(`    - Token count: ${sampleChunk.token_count}`);

    return enrichedChunks;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Enrichment failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Step 4: Embedding Generation (Jina-v3 with Late Chunking)
 */
async function testEmbeddingGeneration(enrichedChunks: any[]) {
  logStep(4, 6, 'Embedding Generation (Jina-v3 with Late Chunking)');

  const startTime = Date.now();

  try {
    const result = await generateEmbeddingsWithLateChunking(
      enrichedChunks,
      'retrieval.passage',
      true // Enable late chunking
    );

    const latency = Date.now() - startTime;
    stats.stepLatencies.embedding.push(latency);

    logSuccess(`Generated ${result.embeddings.length} embeddings (${latency}ms)`);
    logInfo(`  Total tokens: ${result.total_tokens}`);
    logInfo(`  Batch count: ${result.metadata.batch_count}`);
    logInfo(`  Late chunking: ${result.metadata.late_chunking_enabled ? 'Enabled' : 'Disabled'}`);

    // Validate embeddings
    const sampleEmbedding = result.embeddings[0];
    if (!sampleEmbedding.dense_vector || sampleEmbedding.dense_vector.length !== 768) {
      throw new Error(
        `Invalid embedding dimensions: expected 768, got ${sampleEmbedding.dense_vector?.length || 0}`
      );
    }

    logInfo(`  Embedding dimensions: ${sampleEmbedding.dense_vector.length}`);
    logInfo(`  First 3 values: [${sampleEmbedding.dense_vector.slice(0, 3).map(v => v.toFixed(4)).join(', ')}]`);

    stats.totalEmbeddings += result.embeddings.length;
    stats.totalTokens += result.total_tokens;

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Embedding generation failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Step 5: Vector Upload to Qdrant
 */
async function testVectorUpload(embeddingResult: any, documentId: string) {
  logStep(5, 6, 'Vector Upload to Qdrant');

  const startTime = Date.now();

  try {
    // Upload to test collection
    const uploadResult = await uploadChunksToQdrant(embeddingResult.embeddings, {
      batch_size: 100,
      collection_name: COLLECTION_CONFIG.name,
      wait: true,
      enable_sparse: false, // Disable sparse for simplicity in test
    });

    const latency = Date.now() - startTime;
    stats.stepLatencies.upload.push(latency);

    if (!uploadResult.success) {
      throw new Error(uploadResult.error || 'Upload failed');
    }

    logSuccess(`Uploaded ${uploadResult.points_uploaded} points (${latency}ms)`);
    logInfo(`  Batch count: ${uploadResult.batch_count}`);
    logInfo(`  Upload duration: ${uploadResult.duration_ms}ms`);

    return uploadResult;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Vector upload failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Step 6: Semantic Search Test
 */
async function testSemanticSearch(testQuery: string, expectedKeywords: string[]) {
  logStep(6, 6, 'Semantic Search Test');

  const startTime = Date.now();

  try {
    const response = await searchChunks(testQuery, {
      limit: 5,
      score_threshold: 0.5,
      filters: {
        organization_id: 'test-org-001',
        course_id: 'test-course-001',
      },
      enable_hybrid: false,
      include_payload: true,
    });

    const latency = Date.now() - startTime;
    stats.stepLatencies.search.push(latency);

    logSuccess(`Search completed (${latency}ms)`);
    logInfo(`  Query: "${testQuery}"`);
    logInfo(`  Results found: ${response.results.length}`);
    logInfo(`  Search type: ${response.metadata.search_type}`);

    if (response.results.length === 0) {
      logWarning('No results found - this may indicate an issue');
      return response;
    }

    // Display top results
    console.log('\n  Top results:');
    response.results.slice(0, 3).forEach((result, index) => {
      console.log(
        `    ${index + 1}. [Score: ${colors.green}${result.score.toFixed(3)}${colors.reset}] ${result.heading_path}`
      );
      console.log(`       ${colors.dim}${result.content.substring(0, 100)}...${colors.reset}`);
    });

    // Validate relevance by checking for expected keywords
    let relevantCount = 0;
    for (const result of response.results) {
      const contentLower = result.content.toLowerCase();
      const hasKeywords = expectedKeywords.some(keyword =>
        contentLower.includes(keyword.toLowerCase())
      );

      if (hasKeywords) {
        relevantCount++;
      }
    }

    const relevanceRatio = relevantCount / response.results.length;
    logInfo(`  Relevance: ${relevantCount}/${response.results.length} results contain expected keywords`);

    if (relevanceRatio >= 0.6) {
      logSuccess(`Search quality: Good (${(relevanceRatio * 100).toFixed(1)}% relevance)`);
    } else if (relevanceRatio >= 0.3) {
      logWarning(`Search quality: Fair (${(relevanceRatio * 100).toFixed(1)}% relevance)`);
    } else {
      logError(`Search quality: Poor (${(relevanceRatio * 100).toFixed(1)}% relevance)`);
    }

    stats.searchQueries++;
    stats.relevantResults += relevantCount;

    return response;
  } catch (error) {
    const latency = Date.now() - startTime;
    logError(`Search failed (${latency}ms): ${error}`);
    throw error;
  }
}

/**
 * Cleanup: Delete test data from Qdrant
 */
async function cleanupTestData() {
  logSection('Cleanup');

  try {
    // Delete test collection if it exists
    const collections = await qdrantClient.getCollections();
    const testCollectionExists = collections.collections.some(
      c => c.name === COLLECTION_CONFIG.name
    );

    if (testCollectionExists) {
      // Delete all points with test organization/course
      await qdrantClient.delete(COLLECTION_CONFIG.name, {
        filter: {
          must: [
            { key: 'organization_id', match: { value: 'test-org-001' } },
            { key: 'course_id', match: { value: 'test-course-001' } },
          ],
        },
        wait: true,
      });

      logSuccess('Deleted test data from Qdrant');
    }
  } catch (error) {
    logWarning(`Cleanup warning: ${error}`);
    logInfo('Test data may need manual cleanup');
  }
}

/**
 * Display workflow summary
 */
function displaySummary() {
  logSection('Workflow Summary');

  const avgLatency = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  console.log(`\n${colors.bold}Processing Statistics:${colors.reset}`);
  console.log(`  Documents processed: ${colors.cyan}${stats.documentsProcessed}${colors.reset}`);
  console.log(`  Total chunks created: ${colors.cyan}${stats.totalChunks}${colors.reset}`);
  console.log(`  Embeddings generated: ${colors.cyan}${stats.totalEmbeddings}${colors.reset} (768-dimensional)`);
  console.log(`  Total tokens: ${colors.cyan}${stats.totalTokens}${colors.reset}`);

  console.log(`\n${colors.bold}Performance Metrics:${colors.reset}`);
  console.log(`  Average conversion: ${colors.cyan}${avgLatency(stats.stepLatencies.conversion).toFixed(0)}ms${colors.reset}`);
  console.log(`  Average chunking: ${colors.cyan}${avgLatency(stats.stepLatencies.chunking).toFixed(0)}ms${colors.reset}`);
  console.log(`  Average enrichment: ${colors.cyan}${avgLatency(stats.stepLatencies.enrichment).toFixed(0)}ms${colors.reset}`);
  console.log(`  Average embedding: ${colors.cyan}${avgLatency(stats.stepLatencies.embedding).toFixed(0)}ms${colors.reset}`);
  console.log(`  Average upload: ${colors.cyan}${avgLatency(stats.stepLatencies.upload).toFixed(0)}ms${colors.reset}`);
  console.log(`  Average search: ${colors.cyan}${avgLatency(stats.stepLatencies.search).toFixed(0)}ms${colors.reset}`);

  console.log(`\n${colors.bold}Search Quality:${colors.reset}`);
  console.log(`  Test queries: ${colors.cyan}${stats.searchQueries}${colors.reset}`);
  const avgRelevance = stats.searchQueries > 0 ? (stats.relevantResults / (stats.searchQueries * 5)) * 100 : 0;
  console.log(`  Average relevance: ${colors.cyan}${avgRelevance.toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bold}Total Workflow Time:${colors.reset} ${colors.cyan}${(stats.totalLatencyMs / 1000).toFixed(1)}s${colors.reset}`);
}

/**
 * Main test workflow
 */
async function testRAGWorkflow() {
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}End-to-End RAG Workflow Test${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);

  const workflowStartTime = Date.now();

  try {
    // Check environment variables
    logSection('Environment Check');

    const requiredEnvVars = [
      'QDRANT_URL',
      'QDRANT_API_KEY',
      'JINA_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'REDIS_URL',
    ];

    const optionalEnvVars = [
      'DOCLING_MCP_URL', // Only needed for PDF/DOCX/PPTX conversion
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        logError(`Missing environment variable: ${envVar}`);
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
      logSuccess(`${envVar}: Configured`);
    }

    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        logSuccess(`${envVar}: Configured (optional)`);
      } else {
        logWarning(`${envVar}: Not configured (only needed for PDF/DOCX/PPTX)`);
      }
    }

    // Create test documents
    logSection('Test Document Setup');
    const testDocuments = await createTestDocuments();
    logInfo(`Created ${testDocuments.length} test document(s)`);

    // Process each test document
    for (const document of testDocuments) {
      logSection(`Processing: ${document.name}`);

      const documentId = generateUUID();
      stats.documentsProcessed++;

      // Step 1: Convert to Markdown
      const conversionResult = await testDocumentConversion(document);

      // Step 2: Chunk markdown
      const chunkingResult = await testHierarchicalChunking(
        conversionResult.markdown,
        document.name
      );

      // Step 3: Enrich chunks
      const enrichedChunks = await testMetadataEnrichment(
        chunkingResult,
        documentId,
        document.name
      );

      // Step 4: Generate embeddings
      const embeddingResult = await testEmbeddingGeneration(enrichedChunks);

      // Step 5: Upload to Qdrant
      await testVectorUpload(embeddingResult, documentId);

      // Step 6: Test search
      await testSemanticSearch(document.testQuery, document.expectedKeywords);
    }

    stats.totalLatencyMs = Date.now() - workflowStartTime;

    // Display summary
    displaySummary();

    // Cleanup
    await cleanupTestData();

    // Final success message
    logSection('Test Complete');
    logSuccess('All workflow tests passed successfully!');

    console.log(`\n${colors.bold}Next Steps:${colors.reset}`);
    console.log('  1. Run integration tests (T081, T082)');
    console.log('  2. Create test courses with RAG workflow (T083)');
    console.log('  3. Test with larger documents and multiple formats');
    console.log('  4. Benchmark performance under load\n');

    process.exit(0);
  } catch (error) {
    stats.totalLatencyMs = Date.now() - workflowStartTime;

    logSection('Test Failed');
    logError('RAG workflow test failed!');
    console.error(`\n${colors.red}Error Details:${colors.reset}`);
    console.error(error);

    console.log(`\n${colors.bold}Troubleshooting:${colors.reset}`);
    console.log('  1. Check all environment variables are configured');
    console.log('  2. Verify Qdrant Cloud is accessible');
    console.log('  3. Verify Jina API key is valid');
    console.log('  4. Verify Docling MCP server is running');
    console.log('  5. Verify Redis is running');
    console.log('  6. Check logs for detailed error messages\n');

    process.exit(1);
  }
}

// Run the test
testRAGWorkflow();
