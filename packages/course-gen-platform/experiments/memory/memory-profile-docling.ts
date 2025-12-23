/**
 * Memory profiling script for Docling document processing
 * Run: npx tsx experiments/memory/memory-profile-docling.ts
 */

import 'dotenv/config';
import { DoclingClient } from '../../src/stages/stage2-document-processing/docling/client.js';
import path from 'path';

// Paths as seen by Docling container (mounted at /app/uploads)
const TEST_FILES = [
  '/app/uploads/memory-test/1 ТЗ на курс по продажам.docx',
  '/app/uploads/memory-test/Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf',
  '/app/uploads/memory-test/Регламент работы в AMO CRM Megacampus.pdf',
  '/app/uploads/memory-test/Регулярный_Менеджмент_Отдела_Продаж_docx.pdf',
];

function logMemory(label: string) {
  const mem = process.memoryUsage();
  console.log(`[${label}] Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`);
}

async function main() {
  console.log('=== Memory Profile: Docling Processing ===\n');
  logMemory('START');

  const client = new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
  });

  console.log('\nConnecting to Docling...');
  await client.connect();
  logMemory('CONNECTED');

  for (const filePath of TEST_FILES) {
    console.log(`\n--- Processing: ${path.basename(filePath)} ---`);
    logMemory('BEFORE');

    try {
      const result = await client.convertDocument({
        file_path: filePath,
        output_format: 'markdown',
      });

      console.log(`  Content length: ${result.content?.length || 0} chars`);
      logMemory('AFTER');

      // Force GC if available
      if (global.gc) {
        global.gc();
        logMemory('AFTER GC');
      }
    } catch (error) {
      console.error(`  Error: ${error}`);
    }
  }

  console.log('\n--- Final ---');
  logMemory('FINAL');

  await client.disconnect();
  logMemory('DISCONNECTED');
}

main().catch(console.error);
