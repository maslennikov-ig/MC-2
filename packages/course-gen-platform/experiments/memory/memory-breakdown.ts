/**
 * Memory Breakdown Analysis
 *
 * Detailed analysis of what consumes memory in Stage 2 processing
 * Run: npx tsx --expose-gc experiments/memory/memory-breakdown.ts
 */

import 'dotenv/config';

function logMemory(label: string): { heap: number; rss: number; external: number } {
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  const rss = Math.round(mem.rss / 1024 / 1024);
  const external = Math.round(mem.external / 1024 / 1024);
  console.log(`[${label.padEnd(40)}] Heap: ${heap}MB, RSS: ${rss}MB, External: ${external}MB`);
  return { heap, rss, external };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Memory Breakdown Analysis                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const baseline = logMemory('1. Node.js baseline (empty)');

  // Step 2: Import dotenv (already done)
  logMemory('2. After dotenv');

  // Step 3: Import pino logger
  console.log('\n--- Core modules ---');
  await import('../../src/shared/logger/index.js');
  const afterLogger = logMemory('3. After pino logger');
  console.log(`   Delta: +${afterLogger.heap - baseline.heap}MB (pino + transports)`);

  // Step 4: Import ioredis
  await import('ioredis');
  const afterIoredis = logMemory('4. After ioredis import');
  console.log(`   Delta: +${afterIoredis.heap - afterLogger.heap}MB`);

  // Step 5: Import Redis client (creates connection)
  const { getRedisClient } = await import('../../src/shared/cache/redis.js');
  const afterRedisClient = logMemory('5. After redis client module');
  console.log(`   Delta: +${afterRedisClient.heap - afterIoredis.heap}MB`);

  // Step 6: Actually get redis client (lazy)
  getRedisClient();
  const afterRedisInit = logMemory('6. After getRedisClient()');
  console.log(`   Delta: +${afterRedisInit.heap - afterRedisClient.heap}MB`);

  // Step 7: Token estimator
  console.log('\n--- LLM modules ---');
  const { tokenEstimator } = await import('../../src/shared/llm/token-estimator.js');
  const afterTokenEstimator = logMemory('7. After token-estimator');
  console.log(`   Delta: +${afterTokenEstimator.heap - afterRedisInit.heap}MB`);

  // Step 8: LLM client (OpenAI SDK)
  await import('../../src/shared/llm/client.js');
  const afterLlmClient = logMemory('8. After LLM client (OpenAI SDK)');
  console.log(`   Delta: +${afterLlmClient.heap - afterTokenEstimator.heap}MB`);

  // Step 9: Embeddings module
  console.log('\n--- Embeddings ---');
  await import('../../src/shared/embeddings/generate.js');
  const afterEmbeddings = logMemory('9. After embeddings module');
  console.log(`   Delta: +${afterEmbeddings.heap - afterLlmClient.heap}MB`);

  // Step 10: Hierarchical chunking
  console.log('\n--- Summarization ---');
  await import('../../src/shared/summarization/hierarchical-chunking.js');
  const afterHierarchical = logMemory('10. After hierarchical-chunking');
  console.log(`   Delta: +${afterHierarchical.heap - afterEmbeddings.heap}MB`);

  // Step 11: Docling client
  console.log('\n--- Docling ---');
  const { DoclingClient } = await import('../../src/stages/stage2-document-processing/docling/client.js');
  const afterDoclingImport = logMemory('11. After DoclingClient import');
  console.log(`   Delta: +${afterDoclingImport.heap - afterHierarchical.heap}MB`);

  // Step 12: Create Docling client instance
  const doclingClient = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });
  const afterDoclingInstance = logMemory('12. After DoclingClient instance');
  console.log(`   Delta: +${afterDoclingInstance.heap - afterDoclingImport.heap}MB`);

  // Step 13: Connect to Docling
  await doclingClient.connect();
  const afterDoclingConnect = logMemory('13. After Docling connect');
  console.log(`   Delta: +${afterDoclingConnect.heap - afterDoclingInstance.heap}MB`);

  // Step 14: Process a document
  console.log('\n--- Document processing ---');
  const docResult = await doclingClient.convertDocument({
    file_path: '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx',
    output_format: 'markdown',
  });
  const markdown = docResult.content || '';
  console.log(`   Markdown size: ${markdown.length} chars (${Math.round(markdown.length / 1024)}KB)`);
  const afterConvert = logMemory('14. After document conversion');
  console.log(`   Delta: +${afterConvert.heap - afterDoclingConnect.heap}MB`);

  // Step 15: Chunking
  const { executeChunking } = await import('../../src/stages/stage2-document-processing/phases/phase-4-chunking.js');
  const mockJob = { updateProgress: async () => {} } as any;
  const chunkingResult = await executeChunking(
    markdown,
    { document_id: 'test', document_name: 'test.docx', organization_id: 'org', course_id: 'course' },
    mockJob
  );
  console.log(`   Chunks: ${chunkingResult.chunks.child_chunks.length} child, ${chunkingResult.chunks.parent_chunks.length} parent`);
  const afterChunking = logMemory('15. After chunking');
  console.log(`   Delta: +${afterChunking.heap - afterConvert.heap}MB`);

  // Step 16: Embeddings generation
  const { generateEmbeddingsWithLateChunking } = await import('../../src/shared/embeddings/generate.js');
  const embResult = await generateEmbeddingsWithLateChunking(
    chunkingResult.enrichedChunks,
    'retrieval.passage',
    true
  );
  console.log(`   Embeddings: ${embResult.embeddings.length} vectors`);
  const afterEmbGen = logMemory('16. After embedding generation');
  console.log(`   Delta: +${afterEmbGen.heap - afterChunking.heap}MB`);

  // Cleanup
  console.log('\n--- Cleanup ---');
  embResult.embeddings.length = 0;
  const afterClearEmb = logMemory('17. After clearing embeddings array');
  console.log(`   Delta: ${afterClearEmb.heap - afterEmbGen.heap}MB`);

  await doclingClient.disconnect();
  const final = logMemory('18. FINAL (after disconnect)');

  // Summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    MEMORY BREAKDOWN                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ Component                              │ Memory (approx)    │
├────────────────────────────────────────┼────────────────────┤
│ Node.js baseline                       │ ~${baseline.heap}MB              │
│ Pino logger + transports               │ ~${afterLogger.heap - baseline.heap}MB               │
│ ioredis                                │ ~${afterIoredis.heap - afterLogger.heap}MB               │
│ Redis client initialization            │ ~${afterRedisInit.heap - afterIoredis.heap}MB               │
│ Token estimator                        │ ~${afterTokenEstimator.heap - afterRedisInit.heap}MB               │
│ LLM client (OpenAI SDK)                │ ~${afterLlmClient.heap - afterTokenEstimator.heap}MB               │
│ Embeddings module                      │ ~${afterEmbeddings.heap - afterLlmClient.heap}MB               │
│ Hierarchical chunking                  │ ~${afterHierarchical.heap - afterEmbeddings.heap}MB               │
│ Docling client                         │ ~${afterDoclingConnect.heap - afterHierarchical.heap}MB               │
│ Document data + chunks                 │ ~${afterChunking.heap - afterDoclingConnect.heap}MB               │
│ Embeddings vectors                     │ ~${afterEmbGen.heap - afterChunking.heap}MB               │
├────────────────────────────────────────┼────────────────────┤
│ TOTAL                                  │ ~${final.heap}MB              │
└────────────────────────────────────────┴────────────────────┘
  `);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
