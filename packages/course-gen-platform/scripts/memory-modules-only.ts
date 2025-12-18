/**
 * Memory Module Analysis - Quick version
 * Run: npx tsx --expose-gc scripts/memory-modules-only.ts
 */

import 'dotenv/config';

function mem(label: string): number {
  if (global.gc) global.gc();
  const m = process.memoryUsage();
  const heap = Math.round(m.heapUsed / 1024 / 1024);
  console.log(`${label.padEnd(45)} ${heap}MB`);
  return heap;
}

async function main() {
  console.log('=== Memory by Module Import ===\n');

  const start = mem('1. Node.js baseline');

  await import('../src/shared/logger/index.js');
  const logger = mem('2. + Pino logger');

  await import('ioredis');
  const ioredis = mem('3. + ioredis');

  await import('../src/shared/cache/redis.js');
  const redis = mem('4. + Redis client module');

  await import('../src/shared/llm/token-estimator.js');
  const token = mem('5. + Token estimator');

  await import('openai');
  const openai = mem('6. + OpenAI SDK');

  await import('../src/shared/llm/client.js');
  const llm = mem('7. + LLM client');

  await import('../src/shared/embeddings/generate.js');
  const emb = mem('8. + Embeddings module');

  await import('../src/shared/summarization/hierarchical-chunking.js');
  const hier = mem('9. + Hierarchical chunking');

  await import('../src/stages/stage2-document-processing/docling/client.js');
  const docling = mem('10. + Docling client');

  await import('../src/stages/stage2-document-processing/phases/phase-4-chunking.js');
  const chunking = mem('11. + Chunking phase');

  console.log('\n=== Summary ===');
  console.log(`Node.js base:      ${start}MB`);
  console.log(`Pino logger:       +${logger - start}MB`);
  console.log(`ioredis:           +${ioredis - logger}MB`);
  console.log(`Redis client:      +${redis - ioredis}MB`);
  console.log(`Token estimator:   +${token - redis}MB`);
  console.log(`OpenAI SDK:        +${openai - token}MB`);
  console.log(`LLM client:        +${llm - openai}MB`);
  console.log(`Embeddings:        +${emb - llm}MB`);
  console.log(`Hierarchical:      +${hier - emb}MB`);
  console.log(`Docling:           +${docling - hier}MB`);
  console.log(`Chunking:          +${chunking - docling}MB`);
  console.log(`─────────────────────────`);
  console.log(`TOTAL modules:     ${chunking}MB`);
  console.log(`\nRemaining ~${39 - chunking}MB is data: markdown, chunks, embeddings vectors`);
}

main().catch(console.error);
