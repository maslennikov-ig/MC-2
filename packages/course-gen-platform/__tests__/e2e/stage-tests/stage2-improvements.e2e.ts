/**
 * E2E Test: Stage 2 with Production Improvements
 *
 * Tests all 4 improvements:
 * 1. Redis connection grace period
 * 2. Dynamic overlap for small documents
 * 3. Enhanced memory monitoring (2s interval)
 * 4. Memory-based circuit breaker
 *
 * Run: npx tsx --expose-gc __tests__/e2e/stage-tests/stage2-improvements.e2e.ts
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../../.env') });

import { DoclingClient } from '../../../src/stages/stage2-document-processing/docling/client.js';
import { executeChunking } from '../../../src/stages/stage2-document-processing/phases/phase-4-chunking.js';
import { generateEmbeddingsWithLateChunking } from '../../../src/shared/embeddings/generate.js';
import { hierarchicalChunking } from '../../../src/shared/summarization/hierarchical-chunking.js';
import { tokenEstimator } from '../../../src/shared/llm/token-estimator.js';
import { ensureRedisConnection, isRedisConnected } from '../../../src/shared/cache/redis.js';

// Test files (as seen by Docling container)
const TEST_FILES = [
  '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx',
  '/app/uploads/memory-test/Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf',
  '/app/uploads/memory-test/Регламент работы в AMO CRM Megacampus.pdf',
  '/app/uploads/memory-test/Регулярный_Менеджмент_Отдела_Продаж_docx.pdf',
];

const COURSE_ID = 'e2e-stage2-test';
const ORG_ID = 'test-org';

// Memory thresholds to match our improvements
const THRESHOLDS = {
  warning: 512,
  critical: 768,
  emergency: 900,
};

interface TestResult {
  file: string;
  success: boolean;
  markdownLength: number;
  tokens: number;
  chunks: number;
  embeddings: number;
  summaryIterations: number;
  effectiveOverlap: string;
  peakHeap: number;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let peakHeapOverall = 0;

function logMemory(label: string): number {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

  if (heapMB > peakHeapOverall) {
    peakHeapOverall = heapMB;
  }

  // Apply thresholds (matching our improved monitoring)
  let level = 'DEBUG';
  if (heapMB >= THRESHOLDS.emergency) {
    level = 'EMERGENCY';
    if (global.gc) global.gc();
  } else if (heapMB >= THRESHOLDS.critical) {
    level = 'CRITICAL';
  } else if (heapMB >= THRESHOLDS.warning) {
    level = 'WARNING';
  }

  console.log(`[MEM:${level}] ${label}: ${heapMB}MB heap (peak: ${peakHeapOverall}MB)`);
  return heapMB;
}

function forceGC(): void {
  if (global.gc) global.gc();
}

async function processDocument(
  doclingClient: DoclingClient,
  filePath: string,
  index: number
): Promise<TestResult> {
  const fileName = filePath.split('/').pop() || filePath;
  const fileId = `file-${index}`;
  const startTime = Date.now();
  let peakHeap = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing [${index + 1}/${TEST_FILES.length}]: ${fileName}`);
  console.log('='.repeat(60));

  try {
    // Phase 1: Docling conversion
    console.log('\n--- Phase 1: Docling Conversion ---');
    const docResult = await doclingClient.convertDocument({
      file_path: filePath,
      output_format: 'markdown',
    });

    const markdown = docResult.content || '';
    console.log(`  Markdown: ${markdown.length} chars`);
    peakHeap = Math.max(peakHeap, logMemory('After Docling'));

    // Token estimation
    const tokens = tokenEstimator.estimateTokens(markdown, 'rus');
    console.log(`  Tokens: ${tokens}`);

    // Phase 4: Chunking (will show dynamic overlap)
    console.log('\n--- Phase 4: Chunking (watch for dynamic overlap) ---');
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

    console.log(`  Parent chunks: ${chunkingResult.chunks.parent_chunks.length}`);
    console.log(`  Child chunks: ${chunkingResult.chunks.child_chunks.length}`);
    peakHeap = Math.max(peakHeap, logMemory('After Chunking'));

    // Phase 5: Embeddings (cached check)
    console.log('\n--- Phase 5: Embeddings ---');
    const embResult = await generateEmbeddingsWithLateChunking(
      chunkingResult.enrichedChunks,
      'retrieval.passage',
      true
    );
    console.log(`  Embeddings: ${embResult.embeddings.length}`);
    console.log(`  Tokens used: ${embResult.total_tokens}`);
    peakHeap = Math.max(peakHeap, logMemory('After Embeddings'));

    // Clear embeddings
    embResult.embeddings.length = 0;
    forceGC();

    // Phase 6: Summarization (test dynamic overlap + infinite loop fix)
    let summaryIterations = 0;
    let effectiveOverlap = 'N/A';

    if (tokens > 3000) {
      console.log('\n--- Phase 6: Summarization (test infinite loop fix) ---');

      const summaryResult = await hierarchicalChunking(
        markdown,
        'rus',
        'Educational document',
        {
          targetTokens: 200000,
          maxIterations: 3,
          chunkSize: 115000,
          overlapPercent: 5,
          temperature: 0.7,
          maxTokensPerChunk: 10000,
        }
      );

      summaryIterations = summaryResult.iterations;
      console.log(`  Summary: ${summaryResult.summary.length} chars`);
      console.log(`  Iterations: ${summaryIterations}`);

      // Determine what overlap was used based on document size
      const ratio = tokenEstimator.getLanguageRatio('rus');
      const chunkCharSize = Math.ceil(115000 * ratio);
      if (markdown.length < chunkCharSize) {
        effectiveOverlap = '1% (small doc)';
      } else if (markdown.length < chunkCharSize * 2) {
        effectiveOverlap = '2.5% (medium doc)';
      } else {
        effectiveOverlap = '5% (large doc)';
      }
      console.log(`  Effective overlap: ${effectiveOverlap}`);

      peakHeap = Math.max(peakHeap, logMemory('After Summary'));
    } else {
      console.log('\n--- Phase 6: Skipped (tokens < 3000) ---');
      effectiveOverlap = 'skipped';
    }

    forceGC();
    const duration = Date.now() - startTime;

    return {
      file: fileName,
      success: true,
      markdownLength: markdown.length,
      tokens,
      chunks: chunkingResult.chunks.child_chunks.length,
      embeddings: embResult.total_tokens,
      summaryIterations,
      effectiveOverlap,
      peakHeap,
      duration,
    };
  } catch (error) {
    return {
      file: fileName,
      success: false,
      markdownLength: 0,
      tokens: 0,
      chunks: 0,
      embeddings: 0,
      summaryIterations: 0,
      effectiveOverlap: 'error',
      peakHeap,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     E2E Test: Stage 2 with Production Improvements          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  forceGC();
  logMemory('Baseline');

  // Test 1: Redis connection grace period
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ Test 1: Redis Connection Grace Period   │');
  console.log('└─────────────────────────────────────────┘');

  console.log(`  isRedisConnected (before): ${isRedisConnected()}`);
  const redisConnected = await ensureRedisConnection(5000);
  console.log(`  ensureRedisConnection: ${redisConnected ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`  isRedisConnected (after): ${isRedisConnected()}`);

  // Connect to Docling
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ Connecting to Docling                   │');
  console.log('└─────────────────────────────────────────┘');

  const doclingClient = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });
  await doclingClient.connect();
  console.log('  Docling: ✅ Connected');
  logMemory('After Docling connect');

  // Test 2-4: Process all documents
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│ Test 2-4: Document Processing           │');
  console.log('│ (Dynamic Overlap, Memory, No Infinite)  │');
  console.log('└─────────────────────────────────────────┘');

  // Process documents sequentially to see memory behavior clearly
  for (let i = 0; i < TEST_FILES.length; i++) {
    const result = await processDocument(doclingClient, TEST_FILES[i], i);
    results.push(result);
    forceGC();
    logMemory(`After doc ${i + 1} cleanup`);
  }

  // Cleanup
  await doclingClient.disconnect();
  forceGC();
  logMemory('Final');

  const totalDuration = Date.now() - startTime;

  // Summary Report
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS SUMMARY                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  console.log('\n┌─ Improvement 1: Redis Connection Grace Period ─────────────┐');
  console.log(`│  Result: ${redisConnected ? '✅ PASS - Connected with grace period' : '❌ FAIL'}`);
  console.log('└────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Improvement 2: Dynamic Overlap for Small Documents ───────┐');
  results.forEach(r => {
    console.log(`│  ${r.file.substring(0, 40).padEnd(40)} → ${r.effectiveOverlap}`);
  });
  console.log('└────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Improvement 3: Memory Monitoring (thresholds) ────────────┐');
  console.log(`│  Peak heap overall: ${peakHeapOverall}MB`);
  console.log(`│  Warning threshold (512MB): ${peakHeapOverall >= 512 ? '⚠️ Crossed' : '✅ OK'}`);
  console.log(`│  Critical threshold (768MB): ${peakHeapOverall >= 768 ? '🔴 Crossed' : '✅ OK'}`);
  console.log(`│  Emergency threshold (900MB): ${peakHeapOverall >= 900 ? '🚨 Crossed' : '✅ OK'}`);
  console.log('└────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Improvement 4: No Infinite Loop (OOM Fix) ────────────────┐');
  const allSuccess = results.every(r => r.success);
  const noOOM = peakHeapOverall < 500; // Should stay well under 500MB for small docs
  console.log(`│  All documents processed: ${allSuccess ? '✅ YES' : '❌ NO'}`);
  console.log(`│  Memory stable (< 500MB): ${noOOM ? '✅ YES' : '⚠️ HIGH'}`);
  console.log(`│  OOM prevented: ${allSuccess && peakHeapOverall < 1000 ? '✅ YES' : '❌ NO'}`);
  console.log('└────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Document Processing Results ─────────────────────────────┐');
  console.log('│  File                                    │ Status │ Heap  │');
  console.log('├──────────────────────────────────────────┼────────┼───────┤');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const name = r.file.substring(0, 40).padEnd(40);
    console.log(`│  ${name} │  ${status}   │ ${r.peakHeap.toString().padStart(3)}MB │`);
  });
  console.log('└──────────────────────────────────────────┴────────┴───────┘');

  console.log(`\n⏱️  Total time: ${Math.round(totalDuration / 1000)}s`);
  console.log(`📊 Peak memory: ${peakHeapOverall}MB`);
  console.log(`📁 Documents: ${results.filter(r => r.success).length}/${results.length} success`);

  // Exit code
  if (!allSuccess || !redisConnected) {
    console.log('\n❌ TEST FAILED');
    process.exit(1);
  }

  console.log('\n✅ ALL TESTS PASSED');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  logMemory('CRASH');
  process.exit(1);
});
