import fs from 'fs/promises';

import type { DocumentProcessingResult } from './types';

export function shouldUsePlainTextDocumentProcessing(mimeType: string): boolean {
  return mimeType === 'text/plain' || mimeType === 'text/markdown';
}

/**
 * Process TXT/Markdown files without Docling. The shape mirrors the minimal
 * Docling result used by Stage 2 so downstream storage/summarization code can
 * stay unchanged.
 */
export async function processPlainTextDocument(
  filePath: string,
  mimeType: string
): Promise<DocumentProcessingResult> {
  const content = await fs.readFile(filePath, 'utf-8');

  const basicDoclingDoc = {
    schema_version: '2.0' as const,
    name: filePath,
    pages: [],
    texts: [],
    pictures: [],
    tables: [],
    metadata: {
      page_count: 1,
      format: mimeType,
      processing: {
        timestamp: new Date().toISOString(),
      },
    },
  };

  return {
    markdown: content,
    json: basicDoclingDoc,
    images: [],
    stats: {
      markdown_length: content.length,
      pages: 1,
      images: 0,
      tables: 0,
      sections: 0,
      processing_time_ms: 0,
    },
  };
}
