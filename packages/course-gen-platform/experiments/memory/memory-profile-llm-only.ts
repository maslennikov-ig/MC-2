/**
 * Memory profiling script - ONLY LLM summarization
 *
 * Isolates the hierarchicalChunking function to test if it causes OOM
 *
 * Run: npx tsx --expose-gc --max-old-space-size=512 experiments/memory/memory-profile-llm-only.ts
 */

import 'dotenv/config';
import { hierarchicalChunking } from '../../src/shared/summarization/hierarchical-chunking.js';
import { tokenEstimator } from '../../src/shared/llm/token-estimator.js';
import fs from 'fs/promises';

// Read test markdown file directly (not via Docling)
const TEST_MARKDOWN_FILE = './uploads/memory-test/1 ТЗ на курс по продажам.docx.md';

const TARGET_TOKENS = 4096; // Production config

function logMemory(label: string): void {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  console.log(`[${label}] Heap: ${heapMB}MB, RSS: ${rssMB}MB`);
}

function forceGC(): void {
  if (global.gc) {
    global.gc();
    console.log('  [GC forced]');
  }
}

async function main() {
  console.log('=== Memory Profile: LLM ONLY (hierarchicalChunking) ===\n');

  logMemory('START');
  forceGC();
  logMemory('BASELINE');

  // Read markdown content directly from file
  console.log('\n--- Reading test markdown ---');
  let markdown: string;
  try {
    markdown = await fs.readFile(TEST_MARKDOWN_FILE, 'utf-8');
    console.log(`Markdown loaded: ${markdown.length} chars`);
  } catch (e) {
    // If file doesn't exist, create synthetic test data
    console.log('Test file not found, generating synthetic content...');
    // Generate ~30KB of Russian text (similar to real document)
    markdown = 'Тестовый документ для проверки памяти.\n'.repeat(1000);
    markdown += 'Дополнительный контент для увеличения размера.\n'.repeat(500);
    console.log(`Generated markdown: ${markdown.length} chars`);
  }
  logMemory('After markdown load');

  // Estimate tokens
  const estimatedTokens = tokenEstimator.estimateTokens(markdown, 'rus');
  console.log(`\nEstimated tokens: ${estimatedTokens}`);
  console.log(`Target tokens: ${TARGET_TOKENS}`);
  console.log(`Will iterate: ${estimatedTokens > TARGET_TOKENS ? 'YES' : 'NO'}`);

  if (estimatedTokens <= TARGET_TOKENS) {
    console.log('\nDocument too small to trigger LLM, increasing artificially...');
    // Triple the content to force LLM iteration
    markdown = markdown + '\n\n' + markdown + '\n\n' + markdown;
    const newTokens = tokenEstimator.estimateTokens(markdown, 'rus');
    console.log(`New estimated tokens: ${newTokens}`);
  }

  logMemory('Before hierarchicalChunking');

  // Call hierarchicalChunking - THIS IS THE SUSPECTED MEMORY HOG
  console.log('\n--- Starting hierarchicalChunking ---');
  const startTime = Date.now();

  try {
    const result = await hierarchicalChunking(
      markdown,
      'rus',
      'Educational document',
      {
        targetTokens: TARGET_TOKENS,
        maxIterations: 5,
        chunkSize: 115000,
        overlapPercent: 5,
        temperature: 0.7,
        maxTokensPerChunk: 10000,
      }
    );

    const duration = Date.now() - startTime;
    console.log(`\n--- hierarchicalChunking completed in ${duration}ms ---`);
    console.log(`Summary length: ${result.summary.length} chars`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Input tokens: ${result.totalInputTokens}`);
    console.log(`Output tokens: ${result.totalOutputTokens}`);
    logMemory('After hierarchicalChunking');

  } catch (error) {
    console.error('hierarchicalChunking failed:', error);
    logMemory('ON ERROR');
  }

  forceGC();
  logMemory('After GC');

  // Clear references
  // @ts-expect-error - Intentionally setting to null for memory cleanup profiling
  markdown = null;
  forceGC();
  logMemory('FINAL');

  console.log('\n=== Test Complete ===');
}

main().catch(error => {
  console.error('Fatal error:', error);
  logMemory('ON CRASH');
  process.exit(1);
});
