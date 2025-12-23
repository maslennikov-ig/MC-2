/**
 * Memory profiling script - DEBUG version with granular logging
 *
 * Run: npx tsx --expose-gc --max-old-space-size=512 experiments/memory/memory-profile-llm-debug.ts
 */

import 'dotenv/config';

function logMemory(label: string): number {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  console.log(`[MEM] ${label}: Heap=${heapMB}MB, RSS=${rssMB}MB`);
  return heapMB;
}

function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

async function main() {
  console.log('=== Memory Debug: Step by Step ===\n');

  forceGC();
  logMemory('Baseline');

  // Step 1: Import tokenEstimator
  console.log('\n--- Importing tokenEstimator ---');
  const { tokenEstimator } = await import('../../src/shared/llm/token-estimator.js');
  forceGC();
  logMemory('After tokenEstimator import');

  // Step 2: Import llmClient
  console.log('\n--- Importing llmClient ---');
  const { llmClient } = await import('../../src/shared/llm/client.js');
  forceGC();
  logMemory('After llmClient import');

  // Step 3: Import hierarchicalChunking
  console.log('\n--- Importing hierarchicalChunking ---');
  const { hierarchicalChunking } = await import('../../src/shared/summarization/hierarchical-chunking.js');
  forceGC();
  logMemory('After hierarchicalChunking import');

  // Step 4: Create test data
  console.log('\n--- Creating test data ---');
  let markdown = 'Тестовый документ для проверки памяти.\n'.repeat(500);
  console.log(`Test markdown: ${markdown.length} chars`);
  forceGC();
  logMemory('After test data creation');

  // Step 5: Estimate tokens
  console.log('\n--- Estimating tokens ---');
  const tokens = tokenEstimator.estimateTokens(markdown, 'rus');
  console.log(`Estimated tokens: ${tokens}`);
  forceGC();
  logMemory('After token estimation');

  // Step 6: Call hierarchicalChunking
  console.log('\n--- Calling hierarchicalChunking ---');
  console.log('  targetTokens: 4096');
  console.log('  chunkSize: 115000');

  // Monitor memory every 100ms during the call
  const memoryInterval = setInterval(() => {
    logMemory('During hierarchicalChunking');
  }, 100);

  try {
    const result = await hierarchicalChunking(
      markdown,
      'rus',
      'Test document',
      {
        targetTokens: 4096,
        maxIterations: 3,
        chunkSize: 115000,
        overlapPercent: 5,
        temperature: 0.7,
        maxTokensPerChunk: 10000,
      }
    );

    clearInterval(memoryInterval);
    console.log('\n--- hierarchicalChunking completed ---');
    console.log(`Summary: ${result.summary.length} chars`);
    console.log(`Iterations: ${result.iterations}`);
    forceGC();
    logMemory('After hierarchicalChunking');

  } catch (error) {
    clearInterval(memoryInterval);
    console.error('Error:', error);
    forceGC();
    logMemory('On error');
  }

  forceGC();
  logMemory('FINAL');
}

main().catch(error => {
  console.error('Fatal:', error);
  logMemory('CRASH');
  process.exit(1);
});
