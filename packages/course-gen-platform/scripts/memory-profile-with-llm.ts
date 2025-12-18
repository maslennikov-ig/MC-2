/**
 * Memory profiling script WITH ACTUAL LLM CALLS
 *
 * This script tests the REAL memory behavior during document processing
 * including LLM summarization which is the suspected source of OOM.
 *
 * Run: npx tsx --expose-gc --max-old-space-size=512 scripts/memory-profile-with-llm.ts
 *
 * Using 512MB limit to catch OOM earlier for debugging
 */

import 'dotenv/config';
import { DoclingClient } from '../src/stages/stage2-document-processing/docling/client.js';
import { executeChunking } from '../src/stages/stage2-document-processing/phases/phase-4-chunking.js';
import { generateEmbeddingsWithLateChunking } from '../src/shared/embeddings/generate.js';
import { hierarchicalChunking } from '../src/shared/summarization/hierarchical-chunking.js';
import { validateSummaryQuality } from '../src/shared/validation/quality-validator.js';
import { tokenEstimator } from '../src/shared/llm/token-estimator.js';
import { cache } from '../src/shared/cache/redis.js';

// Test files as seen by Docling container
const TEST_FILES = [
  '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx',
  '/app/uploads/memory-test/Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf',
];

const COURSE_ID = 'memory-profile-llm';
const ORG_ID = 'test-org';

// Force LLM to run by using small targetTokens (simulating production config)
const TARGET_TOKENS = 4096; // Same as production stage_2_standard_ru

interface MemoryLog {
  label: string;
  heapMB: number;
  rssMB: number;
  externalMB: number;
  timestamp: number;
}

const memoryLogs: MemoryLog[] = [];

function logMemory(label: string): MemoryLog {
  const mem = process.memoryUsage();
  const log: MemoryLog = {
    label,
    heapMB: Math.round(mem.heapUsed / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    timestamp: Date.now(),
  };
  memoryLogs.push(log);
  console.log(`[${label}] Heap: ${log.heapMB}MB, RSS: ${log.rssMB}MB, External: ${log.externalMB}MB`);
  return log;
}

function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('  [GC forced]');
  }
}

async function clearEmbeddingCache() {
  console.log('\n--- Clearing embedding cache to force API calls ---');
  try {
    const redis = (cache as any).client;
    if (redis) {
      const keys = await redis.keys('embedding:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`Cleared ${keys.length} embedding cache entries`);
      } else {
        console.log('No embedding cache entries to clear');
      }
    }
  } catch (error) {
    console.log(`Cache clear skipped: ${error}`);
  }
}

async function processDocumentWithLLM(
  filePath: string,
  fileIndex: number,
  doclingClient: DoclingClient
): Promise<void> {
  const fileId = `test-file-${fileIndex}`;
  const fileName = filePath.split('/').pop() || 'unknown';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Doc ${fileIndex}] Starting: ${fileName}`);
  console.log(`${'='.repeat(60)}`);
  logMemory(`Doc ${fileIndex} START`);

  // Phase 1: Docling Conversion
  console.log(`\n[Doc ${fileIndex}] Phase 1: Docling Conversion`);
  const doclingResult = await doclingClient.convertDocument({
    file_path: filePath,
    output_format: 'markdown',
  });
  const markdown = doclingResult.content || '';
  console.log(`[Doc ${fileIndex}] Markdown: ${markdown.length} chars`);
  logMemory(`Doc ${fileIndex} Phase 1 complete`);

  // Token estimation
  const estimatedTokens = tokenEstimator.estimateTokens(markdown, 'rus');
  console.log(`[Doc ${fileIndex}] Estimated tokens: ${estimatedTokens}`);

  // Phase 4: Chunking
  console.log(`\n[Doc ${fileIndex}] Phase 4: Chunking`);
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
  logMemory(`Doc ${fileIndex} Phase 4 complete`);

  // Phase 5: Embedding Generation (with UNCACHED embeddings)
  console.log(`\n[Doc ${fileIndex}] Phase 5: Embedding Generation (UNCACHED)`);
  const embeddingResult = await generateEmbeddingsWithLateChunking(
    chunkingResult.enrichedChunks,
    'retrieval.passage',
    true
  );
  console.log(`[Doc ${fileIndex}] Embeddings: ${embeddingResult.embeddings.length}`);
  console.log(`[Doc ${fileIndex}] Tokens used: ${embeddingResult.total_tokens}`);
  logMemory(`Doc ${fileIndex} Phase 5 complete`);

  // Phase 6/7: LLM Summarization (THIS IS THE SUSPECTED MEMORY HOG)
  console.log(`\n[Doc ${fileIndex}] Phase 6/7: LLM Summarization`);
  console.log(`[Doc ${fileIndex}] targetTokens: ${TARGET_TOKENS} (forcing LLM calls)`);
  console.log(`[Doc ${fileIndex}] Document tokens: ${estimatedTokens}`);

  if (estimatedTokens > TARGET_TOKENS) {
    console.log(`[Doc ${fileIndex}] Document exceeds target, LLM WILL RUN`);

    try {
      const summaryResult = await hierarchicalChunking(
        markdown,
        'rus',
        'Educational document',
        {
          targetTokens: TARGET_TOKENS, // Force iteration!
          maxIterations: 5,
          chunkSize: 115000,
          overlapPercent: 5,
          temperature: 0.7,
          maxTokensPerChunk: 10000,
        }
      );

      console.log(`[Doc ${fileIndex}] Summary: ${summaryResult.summary.length} chars`);
      console.log(`[Doc ${fileIndex}] Iterations: ${summaryResult.iterations}`);
      console.log(`[Doc ${fileIndex}] Input tokens: ${summaryResult.totalInputTokens}`);
      console.log(`[Doc ${fileIndex}] Output tokens: ${summaryResult.totalOutputTokens}`);
      logMemory(`Doc ${fileIndex} LLM Summarization complete`);

      // Quality Validation (also uses embeddings)
      console.log(`\n[Doc ${fileIndex}] Quality Validation`);
      const qualityResult = await validateSummaryQuality(
        markdown,
        summaryResult.summary,
        { threshold: 0.75 }
      );
      console.log(`[Doc ${fileIndex}] Quality score: ${qualityResult.quality_score.toFixed(4)}`);
      console.log(`[Doc ${fileIndex}] Quality passed: ${qualityResult.quality_check_passed}`);
      logMemory(`Doc ${fileIndex} Quality Validation complete`);

    } catch (error) {
      console.error(`[Doc ${fileIndex}] Summarization failed: ${error}`);
      logMemory(`Doc ${fileIndex} Summarization FAILED`);
    }
  } else {
    console.log(`[Doc ${fileIndex}] Document under target, LLM skipped`);
  }

  forceGC();
  logMemory(`Doc ${fileIndex} FINAL (after GC)`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('Memory Profile: FULL PIPELINE WITH LLM SUMMARIZATION');
  console.log('='.repeat(70));
  console.log(`Processing ${TEST_FILES.length} documents`);
  console.log(`Target tokens: ${TARGET_TOKENS} (to force LLM iteration)`);
  console.log('');

  logMemory('START');
  forceGC();
  const baseline = logMemory('BASELINE');

  // Clear embedding cache to force Jina API calls
  await clearEmbeddingCache();

  // Initialize Docling client
  const doclingClient = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });
  await doclingClient.connect();
  logMemory('Docling connected');

  // Process documents SEQUENTIALLY first to isolate memory issues
  console.log('\n--- Processing documents SEQUENTIALLY ---');
  const startTime = Date.now();

  for (let i = 0; i < TEST_FILES.length; i++) {
    await processDocumentWithLLM(TEST_FILES[i], i, doclingClient);
    forceGC();
    logMemory(`After document ${i} cleanup`);
  }

  const duration = Date.now() - startTime;
  console.log(`\n--- All documents processed in ${duration}ms ---`);
  logMemory('After all documents');

  forceGC();
  const final = logMemory('FINAL');

  // Cleanup
  await doclingClient.disconnect();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('MEMORY ANALYSIS SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total memory growth: ${final.heapMB - baseline.heapMB}MB heap`);
  console.log(`Peak heap: ${Math.max(...memoryLogs.map(l => l.heapMB))}MB`);
  console.log(`Peak RSS: ${Math.max(...memoryLogs.map(l => l.rssMB))}MB`);

  console.log('\n--- Memory Timeline ---');
  memoryLogs.forEach(log => {
    console.log(`${log.label.padEnd(45)} Heap: ${log.heapMB}MB, RSS: ${log.rssMB}MB`);
  });

  console.log('\n=== Test Complete ===');
}

main().catch(error => {
  console.error('Fatal error:', error);
  logMemory('ON CRASH');
  process.exit(1);
});
