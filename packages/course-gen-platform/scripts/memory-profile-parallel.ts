/**
 * Memory profiling script for PARALLEL document processing
 * Simulates worker behavior with multiple documents processed concurrently
 *
 * Run: npx tsx --expose-gc --max-old-space-size=512 scripts/memory-profile-parallel.ts
 *
 * Using 512MB limit to catch OOM earlier for debugging
 */

import 'dotenv/config';
import { DoclingClient } from '../src/stages/stage2-document-processing/docling/client.js';
import { executeChunking } from '../src/stages/stage2-document-processing/phases/phase-4-chunking.js';
import { generateEmbeddingsWithLateChunking } from '../src/shared/embeddings/generate.js';
import { hierarchicalChunking } from '../src/shared/summarization/hierarchical-chunking.js';
import { tokenEstimator } from '../src/shared/llm/token-estimator.js';
import { cache } from '../src/shared/cache/redis.js';

// Test files as seen by Docling container
const TEST_FILES = [
  '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx',
  '/app/uploads/memory-test/Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf',
  '/app/uploads/memory-test/Регламент работы в AMO CRM Megacampus.pdf',
  '/app/uploads/memory-test/Регулярный_Менеджмент_Отдела_Продаж_docx.pdf',
];

const COURSE_ID = 'memory-profile-parallel';
const ORG_ID = 'test-org';

function logMemory(label: string) {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const externalMB = Math.round(mem.external / 1024 / 1024);
  console.log(`[${label}] Heap: ${heapMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB`);
  return { heapMB, rssMB, externalMB };
}

function forceGC() {
  if (global.gc) {
    global.gc();
  }
}

async function processDocument(
  filePath: string,
  fileIndex: number,
  doclingClient: DoclingClient
): Promise<void> {
  const fileId = `test-file-${fileIndex}`;
  const fileName = filePath.split('/').pop() || 'unknown';

  console.log(`\n[Doc ${fileIndex}] Starting: ${fileName}`);
  logMemory(`Doc ${fileIndex} START`);

  // Phase 1: Docling Conversion
  const doclingResult = await doclingClient.convertDocument({
    file_path: filePath,
    output_format: 'markdown',
  });
  const markdown = doclingResult.content || '';
  console.log(`[Doc ${fileIndex}] Markdown: ${markdown.length} chars`);
  logMemory(`Doc ${fileIndex} Phase 1`);

  // Token estimation
  const estimatedTokens = tokenEstimator.estimateTokens(markdown, 'rus');
  console.log(`[Doc ${fileIndex}] Tokens: ${estimatedTokens}`);

  // Phase 4: Chunking
  const mockJob = { updateProgress: async () => {} } as any;
  const chunkingResult = await executeChunking(
    markdown,
    {
      document_id: fileId,
      document_name: fileName,
      organization_id: ORG_ID,
      course_id: COURSE_ID,
    },
    mockJob
  );
  console.log(`[Doc ${fileIndex}] Chunks: ${chunkingResult.enrichedChunks.length}`);
  logMemory(`Doc ${fileIndex} Phase 4`);

  // Phase 5: Embedding Generation
  const embeddingResult = await generateEmbeddingsWithLateChunking(
    chunkingResult.enrichedChunks,
    'retrieval.passage',
    true
  );
  console.log(`[Doc ${fileIndex}] Embeddings: ${embeddingResult.embeddings.length}`);
  logMemory(`Doc ${fileIndex} Phase 5`);

  // Phase 6: Summarization (if tokens > 3000)
  if (estimatedTokens > 3000) {
    console.log(`[Doc ${fileIndex}] Running LLM summarization...`);
    try {
      const summaryResult = await hierarchicalChunking(
        markdown,
        'rus',
        'Educational document',
        {
          targetTokens: 200000,
          maxIterations: 3,
        }
      );
      console.log(`[Doc ${fileIndex}] Summary: ${summaryResult.summary.length} chars, iterations: ${summaryResult.iterations}`);
    } catch (error) {
      console.error(`[Doc ${fileIndex}] Summarization failed: ${error}`);
    }
  }

  logMemory(`Doc ${fileIndex} COMPLETE`);
}

async function main() {
  console.log('=== Memory Profile: PARALLEL Document Processing ===');
  console.log(`Processing ${TEST_FILES.length} documents concurrently\n`);

  logMemory('START');
  forceGC();
  logMemory('BASELINE');

  // Clear embedding cache to simulate fresh processing
  console.log('\n--- Clearing embedding cache ---');
  try {
    // Flush only embedding keys
    const redis = (cache as any).client;
    if (redis) {
      const keys = await redis.keys('embedding:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`Cleared ${keys.length} embedding cache entries`);
      }
    }
  } catch (error) {
    console.log(`Cache clear skipped: ${error}`);
  }

  // Initialize Docling client (shared across all documents)
  const doclingClient = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });
  await doclingClient.connect();
  logMemory('Docling connected');

  // Process all documents IN PARALLEL (simulating worker behavior)
  console.log('\n--- Starting PARALLEL processing ---');
  logMemory('Before parallel');

  const startTime = Date.now();

  // This is how BullMQ worker processes with concurrency
  await Promise.all(
    TEST_FILES.map((filePath, index) =>
      processDocument(filePath, index, doclingClient)
    )
  );

  const duration = Date.now() - startTime;
  console.log(`\n--- All documents processed in ${duration}ms ---`);
  logMemory('After parallel');

  forceGC();
  logMemory('After GC');

  // Cleanup
  await doclingClient.disconnect();
  logMemory('FINAL');

  console.log('\n=== Test Complete ===');
}

main().catch(error => {
  console.error('Fatal error:', error);
  logMemory('ON CRASH');
  process.exit(1);
});
