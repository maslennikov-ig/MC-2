/**
 * Memory profiling script for Stage 2 document processing pipeline
 * Run: npx tsx --expose-gc experiments/memory/memory-profile-stage2.ts
 */

import 'dotenv/config';
import { DoclingClient } from '../../src/stages/stage2-document-processing/docling/client.js';
import { executeChunking } from '../../src/stages/stage2-document-processing/phases/phase-4-chunking.js';
import { generateEmbeddingsWithLateChunking } from '../../src/shared/embeddings/generate.js';
import { hierarchicalChunking } from '../../src/shared/summarization/hierarchical-chunking.js';
import { tokenEstimator } from '../../src/shared/llm/token-estimator.js';

// Test file path as seen by Docling container
const TEST_FILE = '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx';
const COURSE_ID = 'memory-profile-test';
const ORG_ID = 'test-org';
const FILE_ID = 'test-file-001';

interface MemorySnapshot {
  label: string;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

const snapshots: MemorySnapshot[] = [];

function takeSnapshot(label: string): MemorySnapshot {
  const mem = process.memoryUsage();
  const snapshot: MemorySnapshot = {
    label,
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
    arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
  };
  snapshots.push(snapshot);
  console.log(`[${label}] Heap: ${snapshot.heapUsed}MB (total: ${snapshot.heapTotal}MB), RSS: ${snapshot.rss}MB, External: ${snapshot.external}MB`);
  return snapshot;
}

function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('  [GC forced]');
  }
}

function printDelta(from: MemorySnapshot, to: MemorySnapshot) {
  const delta = to.heapUsed - from.heapUsed;
  const sign = delta >= 0 ? '+' : '';
  console.log(`  Delta: ${sign}${delta}MB heap`);
}

async function main() {
  console.log('=== Memory Profile: Stage 2 Full Pipeline ===\n');
  console.log(`Test file: ${TEST_FILE}\n`);

  takeSnapshot('START');
  forceGC();
  const baseline = takeSnapshot('BASELINE (after GC)');

  // Phase 1: Docling Conversion
  console.log('\n--- Phase 1: Docling Conversion ---');
  const doclingClient = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });

  await doclingClient.connect();
  takeSnapshot('Docling connected');

  const doclingResult = await doclingClient.convertDocument({
    file_path: TEST_FILE,
    output_format: 'markdown',
  });

  const markdown = doclingResult.content || '';
  console.log(`  Markdown length: ${markdown.length} chars`);

  const phase1 = takeSnapshot('Phase 1 complete');
  printDelta(baseline, phase1);
  forceGC();
  takeSnapshot('Phase 1 after GC');

  // Token estimation
  console.log('\n--- Token Estimation ---');
  const estimatedTokens = tokenEstimator.estimateTokens(markdown, 'rus');
  console.log(`  Estimated tokens: ${estimatedTokens}`);

  // Phase 4: Chunking
  console.log('\n--- Phase 4: Hierarchical Chunking ---');
  const phase4Start = takeSnapshot('Phase 4 start');

  const mockJob = {
    updateProgress: async () => {},
  } as any;

  const chunkingResult = await executeChunking(
    markdown,
    {
      document_id: FILE_ID,
      document_name: 'test.docx',
      organization_id: ORG_ID,
      course_id: COURSE_ID,
    },
    mockJob
  );

  console.log(`  Parent chunks: ${chunkingResult.chunks.parent_chunks.length}`);
  console.log(`  Child chunks: ${chunkingResult.chunks.child_chunks.length}`);
  console.log(`  Enriched chunks: ${chunkingResult.enrichedChunks.length}`);

  const phase4 = takeSnapshot('Phase 4 complete');
  printDelta(phase4Start, phase4);
  forceGC();
  takeSnapshot('Phase 4 after GC');

  // Phase 5: Embedding Generation
  console.log('\n--- Phase 5: Embedding Generation ---');
  const phase5Start = takeSnapshot('Phase 5 start');

  const embeddingResult = await generateEmbeddingsWithLateChunking(
    chunkingResult.enrichedChunks,
    'retrieval.passage',
    true
  );

  console.log(`  Embeddings generated: ${embeddingResult.embeddings.length}`);
  console.log(`  Total tokens: ${embeddingResult.total_tokens}`);

  const phase5 = takeSnapshot('Phase 5 complete');
  printDelta(phase5Start, phase5);
  forceGC();
  takeSnapshot('Phase 5 after GC');

  // Clear embeddings to free memory
  console.log('\n--- Clearing embeddings array ---');
  embeddingResult.embeddings.length = 0;
  forceGC();
  takeSnapshot('After clearing embeddings');

  // Phase 6: Summarization (only if tokens > 3000)
  if (estimatedTokens > 3000) {
    console.log('\n--- Phase 6: LLM Summarization ---');
    const phase6Start = takeSnapshot('Phase 6 start');

    try {
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

      console.log(`  Summary length: ${summaryResult.summary.length} chars`);
      console.log(`  Iterations: ${summaryResult.iterations}`);
      console.log(`  Input tokens: ${summaryResult.totalInputTokens}`);
      console.log(`  Output tokens: ${summaryResult.totalOutputTokens}`);

      const phase6 = takeSnapshot('Phase 6 complete');
      printDelta(phase6Start, phase6);
    } catch (error) {
      console.error(`  Summarization failed: ${error}`);
      takeSnapshot('Phase 6 failed');
    }

    forceGC();
    takeSnapshot('Phase 6 after GC');
  } else {
    console.log('\n--- Phase 6: Skipped (tokens < 3000) ---');
  }

  // Disconnect
  console.log('\n--- Cleanup ---');
  await doclingClient.disconnect();
  forceGC();
  const final = takeSnapshot('FINAL');

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total memory growth: ${final.heapUsed - baseline.heapUsed}MB heap`);
  console.log(`Peak RSS: ${Math.max(...snapshots.map(s => s.rss))}MB`);

  console.log('\n=== All Snapshots ===');
  snapshots.forEach(s => {
    console.log(`${s.label.padEnd(30)} Heap: ${s.heapUsed}MB, RSS: ${s.rss}MB`);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
