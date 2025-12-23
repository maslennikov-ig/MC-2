/**
 * MINIMAL memory test - manually reimplement hierarchicalChunking logic
 * to identify which specific operation causes the memory explosion
 *
 * Run: npx tsx --expose-gc --max-old-space-size=512 experiments/memory/memory-profile-minimal.ts
 */

import 'dotenv/config';

function logMemory(label: string): number {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  console.log(`[MEM] ${label}: ${heapMB}MB`);
  return heapMB;
}

function forceGC(): void {
  if (global.gc) global.gc();
}

async function main() {
  console.log('=== Minimal Memory Test ===\n');

  forceGC();
  logMemory('Baseline');

  // Step 1: Import ONLY token estimator (no logger)
  console.log('\n--- Step 1: Import tokenEstimator ---');
  const { tokenEstimator } = await import('../../src/shared/llm/token-estimator.js');
  forceGC();
  logMemory('After tokenEstimator');

  // Step 2: Create test text
  console.log('\n--- Step 2: Create test text ---');
  const text = 'Тестовый документ для проверки памяти.\n'.repeat(500);
  console.log(`Text length: ${text.length} chars`);
  forceGC();
  logMemory('After text creation');

  // Step 3: Estimate tokens (like hierarchicalChunking does)
  console.log('\n--- Step 3: Estimate tokens ---');
  const currentTokens = tokenEstimator.estimateTokens(text, 'rus');
  console.log(`Tokens: ${currentTokens}`);
  forceGC();
  logMemory('After token estimation');

  // Step 4: Get language ratio (like createChunks does)
  console.log('\n--- Step 4: Get language ratio ---');
  const ratio = tokenEstimator.getLanguageRatio('rus');
  console.log(`Ratio: ${ratio}`);
  forceGC();
  logMemory('After ratio');

  // Step 5: Create chunks (replicating createChunks function)
  console.log('\n--- Step 5: Create chunks ---');
  const chunkSize = 115000;
  const overlapPercent = 5;
  const chunkCharSize = Math.ceil(chunkSize * ratio);
  const overlapCharSize = Math.ceil((chunkSize * (overlapPercent / 100)) * ratio);
  console.log(`Chunk char size: ${chunkCharSize}, overlap: ${overlapCharSize}`);

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkCharSize, text.length);
    const chunk = text.slice(start, end);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    start = end - overlapCharSize;
    if (start >= end - 1) start = end;
  }
  console.log(`Chunks created: ${chunks.length}`);
  forceGC();
  logMemory('After chunk creation');

  // Step 6: Import logger (this might be the issue)
  console.log('\n--- Step 6: Import logger ---');
  const logger = await import('../../src/shared/logger/index.js');
  forceGC();
  logMemory('After logger import');

  // Step 7: Log something
  console.log('\n--- Step 7: Log something with pino ---');
  logger.default.info({ test: true }, 'Test log message');
  forceGC();
  logMemory('After pino log');

  // Step 8: Import LLM client
  console.log('\n--- Step 8: Import LLM client ---');
  const { llmClient } = await import('../../src/shared/llm/client.js');
  forceGC();
  logMemory('After llmClient import');

  // Step 9: Try to make an LLM call (this might be the issue)
  console.log('\n--- Step 9: Try LLM call ---');
  try {
    const response = await llmClient.generateCompletion(
      'Say hello in one word',
      {
        model: 'openai/gpt-4o-mini',
        maxTokens: 10,
        temperature: 0.1,
      }
    );
    console.log(`LLM response: ${response.content}`);
    forceGC();
    logMemory('After LLM call');
  } catch (error) {
    console.log(`LLM error: ${error}`);
    forceGC();
    logMemory('After LLM error');
  }

  forceGC();
  logMemory('FINAL');

  console.log('\n=== Test Complete ===');
}

main().catch(error => {
  console.error('Fatal:', error);
  logMemory('CRASH');
  process.exit(1);
});
